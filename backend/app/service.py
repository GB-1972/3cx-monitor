from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import Settings
from .connector import ThreeCxConnector, ThreeCxError
from .models import Installation, Snapshot
from .security import decrypt_secret


def latest_snapshot(db: Session, installation_id: int) -> Snapshot | None:
    return db.scalars(
        select(Snapshot)
        .where(Snapshot.installation_id == installation_id)
        .order_by(Snapshot.checked_at.desc(), Snapshot.id.desc())
        .limit(1)
    ).first()


def snapshot_payload(installation: Installation, snapshot: Snapshot | None) -> dict:
    if not snapshot:
        return {
            "installation_id": installation.id,
            "customer_name": installation.customer_name,
            "base_url": installation.base_url,
            "status": "unknown",
            "message": "No snapshot collected yet",
            "checked_at": None,
            "data": {},
        }
    return {
        "installation_id": installation.id,
        "customer_name": installation.customer_name,
        "base_url": installation.base_url,
        "status": snapshot.status,
        "message": snapshot.message,
        "checked_at": snapshot.checked_at.isoformat() if snapshot.checked_at else None,
        "data": snapshot.data,
    }


async def collect_installation(db: Session, installation: Installation, settings: Settings) -> Snapshot:
    try:
        secret = decrypt_secret(installation.client_secret_encrypted, settings)
        connector = ThreeCxConnector(
            base_url=installation.base_url,
            client_id=installation.client_id,
            client_secret=secret,
            timeout=settings.request_timeout_seconds,
        )
        data = await connector.snapshot()
        check_states = [check.get("status") for check in data.get("checks", [])]
        if "critical" in check_states:
            status = "critical"
        elif "warning" in check_states:
            status = "warning"
        else:
            status = "ok"
        message = "Snapshot collected"
    except ThreeCxError as exc:
        status = "critical"
        message = str(exc)
        data = {"summary": {}, "trunks": [], "events": [], "checks": []}
    except Exception as exc:
        status = "critical"
        message = f"Unexpected collector error: {exc}"
        data = {"summary": {}, "trunks": [], "events": [], "checks": []}

    snapshot = Snapshot(
        installation_id=installation.id,
        status=status,
        message=message,
        data=data,
        checked_at=datetime.now(timezone.utc),
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot

