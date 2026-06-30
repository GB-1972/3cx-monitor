from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from .config import Settings, get_settings
from .db import SessionLocal, get_db, init_db
from .models import Installation, Snapshot
from .schemas import InstallationCreate, InstallationOut, InstallationUpdate, LoginRequest, LoginResponse, SnapshotOut
from .security import encrypt_secret, require_admin, sign_token, verify_login
from .service import collect_installation, latest_snapshot, snapshot_payload


async def poller(settings: Settings) -> None:
    await asyncio.sleep(3)
    while True:
        db = SessionLocal()
        try:
            installations = db.scalars(select(Installation).where(Installation.enabled.is_(True))).all()
            for installation in installations:
                await collect_installation(db, installation, settings)
        finally:
            db.close()
        await asyncio.sleep(max(settings.poll_interval_seconds, 10))


def seed_initial_installation(settings: Settings) -> None:
    if not settings.seed_installation_enabled:
        return

    required = [
        settings.seed_installation_customer_name,
        settings.seed_installation_base_url,
        settings.seed_installation_client_id,
        settings.seed_installation_client_secret,
    ]
    if not all(value.strip() for value in required):
        return

    base_url = settings.seed_installation_base_url.rstrip("/")
    db = SessionLocal()
    try:
        installation = db.scalar(
            select(Installation).where(
                (Installation.customer_name == settings.seed_installation_customer_name)
                | (Installation.base_url == base_url)
            )
        )
        if installation is None:
            installation = Installation(
                customer_name=settings.seed_installation_customer_name,
                base_url=base_url,
                client_id=settings.seed_installation_client_id,
                client_secret_encrypted=encrypt_secret(settings.seed_installation_client_secret, settings),
                enabled=True,
            )
            db.add(installation)
        else:
            installation.customer_name = settings.seed_installation_customer_name
            installation.base_url = base_url
            installation.client_id = settings.seed_installation_client_id
            installation.client_secret_encrypted = encrypt_secret(settings.seed_installation_client_secret, settings)
            installation.enabled = True
        db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    settings = get_settings()
    seed_initial_installation(settings)
    task = asyncio.create_task(poller(settings))
    yield
    task.cancel()


app = FastAPI(title="3CX Monitor", version="0.1.0", lifespan=lifespan)
settings = get_settings()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/auth/login", response_model=LoginResponse)
def login(payload: LoginRequest, settings: Settings = Depends(get_settings)) -> LoginResponse:
    if not verify_login(payload.username, payload.password, settings):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return LoginResponse(token=sign_token({"sub": payload.username}, settings))


@app.get("/api/installations", response_model=list[InstallationOut])
def list_installations(_: dict = Depends(require_admin), db: Session = Depends(get_db)) -> list[InstallationOut]:
    installations = db.scalars(select(Installation).order_by(Installation.customer_name.asc())).all()
    return [
        InstallationOut(
            id=item.id,
            customer_name=item.customer_name,
            base_url=item.base_url,
            client_id=item.client_id,
            enabled=item.enabled,
        )
        for item in installations
    ]


@app.post("/api/installations", response_model=InstallationOut)
def create_installation(
    payload: InstallationCreate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> InstallationOut:
    installation = Installation(
        customer_name=payload.customer_name,
        base_url=str(payload.base_url).rstrip("/"),
        client_id=payload.client_id,
        client_secret_encrypted=encrypt_secret(payload.client_secret, settings),
        enabled=payload.enabled,
    )
    db.add(installation)
    db.commit()
    db.refresh(installation)
    return InstallationOut(
        id=installation.id,
        customer_name=installation.customer_name,
        base_url=installation.base_url,
        client_id=installation.client_id,
        enabled=installation.enabled,
    )


@app.patch("/api/installations/{installation_id}", response_model=InstallationOut)
def update_installation(
    installation_id: int,
    payload: InstallationUpdate,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> InstallationOut:
    installation = db.get(Installation, installation_id)
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    if payload.customer_name is not None:
        installation.customer_name = payload.customer_name
    if payload.base_url is not None:
        installation.base_url = str(payload.base_url).rstrip("/")
    if payload.client_id is not None:
        installation.client_id = payload.client_id
    if payload.client_secret is not None:
        installation.client_secret_encrypted = encrypt_secret(payload.client_secret, settings)
    if payload.enabled is not None:
        installation.enabled = payload.enabled
    db.commit()
    db.refresh(installation)
    return InstallationOut(
        id=installation.id,
        customer_name=installation.customer_name,
        base_url=installation.base_url,
        client_id=installation.client_id,
        enabled=installation.enabled,
    )


@app.delete("/api/installations/{installation_id}")
def delete_installation(
    installation_id: int,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    installation = db.get(Installation, installation_id)
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    db.execute(delete(Snapshot).where(Snapshot.installation_id == installation_id))
    db.delete(installation)
    db.commit()
    return {"status": "deleted"}


@app.get("/api/dashboard", response_model=list[SnapshotOut])
def dashboard(_: dict = Depends(require_admin), db: Session = Depends(get_db)) -> list[dict]:
    installations = db.scalars(select(Installation).order_by(Installation.customer_name.asc())).all()
    return [snapshot_payload(item, latest_snapshot(db, item.id)) for item in installations]


@app.post("/api/installations/{installation_id}/refresh", response_model=SnapshotOut)
async def refresh_installation(
    installation_id: int,
    _: dict = Depends(require_admin),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> dict:
    installation = db.get(Installation, installation_id)
    if not installation:
        raise HTTPException(status_code=404, detail="Installation not found")
    snapshot = await collect_installation(db, installation, settings)
    return snapshot_payload(installation, snapshot)
