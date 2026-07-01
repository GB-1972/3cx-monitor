from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import httpx


class ThreeCxError(Exception):
    pass


class ThreeCxConnector:
    def __init__(self, base_url: str, client_id: str, client_secret: str, timeout: float = 12.0):
        self.base_url = base_url.rstrip("/")
        self.client_id = client_id
        self.client_secret = client_secret
        self.timeout = timeout

    async def _token(self, client: httpx.AsyncClient) -> str:
        try:
            response = await client.post(
                f"{self.base_url}/connect/token",
                data={
                    "client_id": self.client_id,
                    "client_secret": self.client_secret,
                    "grant_type": "client_credentials",
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        except httpx.RequestError as exc:
            raise ThreeCxError(f"3CX not reachable: {exc}") from exc
        if response.status_code >= 400:
            raise ThreeCxError(f"3CX authentication failed with HTTP {response.status_code}")
        token = response.json().get("access_token")
        if not token:
            raise ThreeCxError("3CX authentication did not return an access token")
        return token

    async def _get(self, client: httpx.AsyncClient, token: str, path: str, params: dict[str, Any] | None = None) -> Any:
        try:
            response = await client.get(
                f"{self.base_url}{path}",
                params=params,
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError as exc:
            raise ThreeCxError(f"3CX request failed for {path}: {exc}") from exc
        if response.status_code == 404:
            return None
        if response.status_code >= 400:
            raise ThreeCxError(f"3CX request {path} failed with HTTP {response.status_code}")
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return {"body": response.text}

    async def _post(self, client: httpx.AsyncClient, token: str, path: str, payload: dict[str, Any] | None = None) -> Any:
        try:
            response = await client.post(
                f"{self.base_url}{path}",
                json=payload or {},
                headers={"Authorization": f"Bearer {token}"},
            )
        except httpx.RequestError as exc:
            raise ThreeCxError(f"3CX request failed for {path}: {exc}") from exc
        if response.status_code >= 400:
            raise ThreeCxError(f"3CX request {path} failed with HTTP {response.status_code}")
        if not response.content:
            return None
        try:
            return response.json()
        except ValueError:
            return {"body": response.text}

    @staticmethod
    def _values(payload: Any) -> list[dict[str, Any]]:
        if isinstance(payload, dict) and isinstance(payload.get("value"), list):
            return payload["value"]
        if isinstance(payload, list):
            return payload
        return []

    @staticmethod
    def _health(name: str, status: str, message: str, details: dict[str, Any] | None = None) -> dict[str, Any]:
        return {"name": name, "status": status, "message": message, "details": details or {}}

    @staticmethod
    def _parse_datetime(value: Any) -> datetime | None:
        if not value or not isinstance(value, str):
            return None
        normalized = value.strip()
        if normalized.endswith("Z"):
            normalized = f"{normalized[:-1]}+00:00"
        if "." in normalized:
            head, tail = normalized.split(".", 1)
            fraction = []
            rest = []
            for char in tail:
                if char.isdigit() and not rest:
                    fraction.append(char)
                else:
                    rest.append(char)
            normalized = f"{head}.{''.join(fraction[:6])}{''.join(rest)}"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    def _license_check(self, system: dict[str, Any]) -> dict[str, Any]:
        expires_raw = system.get("ExpirationDate")
        expires_at = self._parse_datetime(expires_raw)
        license_active = system.get("LicenseActive", system.get("Activated"))

        if license_active is False:
            return self._health(
                "Lizenz",
                "critical",
                "Lizenz ist nicht aktiv",
                {"license_active": license_active, "license_expires": expires_raw},
            )

        if expires_at is None:
            return self._health(
                "Lizenz",
                "unknown",
                "Lizenzlaufzeit wurde nicht geliefert",
                {"license_active": license_active, "license_expires": expires_raw},
            )

        now = datetime.now(timezone.utc)
        days_remaining = (expires_at.date() - now.date()).days
        if expires_at <= now + timedelta(days=7):
            status = "critical"
        elif expires_at <= now + timedelta(days=14):
            status = "warning"
        else:
            status = "ok"

        if days_remaining < 0:
            message = f"Lizenz seit {abs(days_remaining)} Tag(en) abgelaufen"
        elif days_remaining == 0:
            message = "Lizenz läuft heute ab"
        else:
            message = f"Lizenz läuft in {days_remaining} Tag(en) ab"

        return self._health(
            "Lizenz",
            status,
            message,
            {
                "days_remaining": days_remaining,
                "license_active": license_active,
                "license_expires": expires_raw,
            },
        )

    def _evaluate(self, raw: dict[str, Any]) -> dict[str, Any]:
        system = raw.get("system_status") or {}
        trunks = self._values(raw.get("trunks"))
        events = self._values(raw.get("event_logs"))
        sbcs = self._values(raw.get("sbcs"))

        checks: list[dict[str, Any]] = []

        trunks_total = system.get("TrunksTotal", len(trunks))
        trunks_registered = system.get("TrunksRegistered")
        trunks_online = sum(1 for trunk in trunks if trunk.get("IsOnline") is True)
        if trunks:
            checks.append(self._health(
                "Trunks",
                "ok" if trunks_online == len(trunks) else "critical",
                f"{trunks_online}/{len(trunks)} SIP trunks online",
                {"trunks": trunks},
            ))
        elif trunks_total is not None and trunks_registered is not None:
            checks.append(self._health(
                "Trunks",
                "ok" if trunks_registered == trunks_total else "critical",
                f"{trunks_registered}/{trunks_total} SIP trunks registered",
            ))

        checks.append(self._health(
            "Dienste",
            "critical" if system.get("HasNotRunningServices") else "ok",
            "One or more 3CX services are not running" if system.get("HasNotRunningServices") else "No stopped services reported by XAPI",
        ))

        checks.append(self._license_check(system))

        if sbcs:
            connected = sum(1 for sbc in sbcs if sbc.get("HasConnection") is True)
            checks.append(self._health(
                "SBCs",
                "ok" if connected == len(sbcs) else "critical",
                f"{connected}/{len(sbcs)} SBCs connected",
                {"sbcs": sbcs},
            ))

        return {
            "summary": {
                "fqdn": system.get("FQDN"),
                "version": system.get("Version"),
                "active_calls": system.get("CallsActive", len(self._values(raw.get("active_calls")))),
                "max_sim_calls": system.get("MaxSimCalls"),
                "trunks_registered": trunks_registered,
                "trunks_total": trunks_total,
                "extensions_registered": system.get("ExtensionsRegistered"),
                "extensions_total": system.get("ExtensionsTotal"),
                "last_backup": system.get("LastBackupDateTime"),
                "backup_scheduled": system.get("BackupScheduled"),
                "license_active": system.get("LicenseActive", system.get("Activated")),
                "license_expires": system.get("ExpirationDate"),
                "product_code": system.get("ProductCode"),
                "maintenance_expires": system.get("MaintenanceExpiresAt"),
                "has_not_running_services": system.get("HasNotRunningServices"),
            },
            "trunks": trunks,
            "events": events[:5],
            "checks": checks,
            "raw": raw,
        }

    async def snapshot(self) -> dict[str, Any]:
        async with httpx.AsyncClient(timeout=self.timeout, verify=True) as client:
            token = await self._token(client)
            raw = {
                "system_status": await self._get(client, token, "/xapi/v1/SystemStatus"),
                "trunks": await self._get(client, token, "/xapi/v1/Trunks", {"$top": 100, "$expand": "Gateway"}),
                "active_calls": await self._get(client, token, "/xapi/v1/ActiveCalls", {"$top": 100, "$orderby": "EstablishedAt asc"}),
                "event_logs": await self._get(client, token, "/xapi/v1/EventLogs", {"$top": 5, "$orderby": "TimeGenerated desc"}),
                "sbcs": await self._get(client, token, "/xapi/v1/Sbcs", {"$top": 100}),
            }
        evaluated = self._evaluate(raw)
        evaluated["checked_at"] = datetime.now(timezone.utc).isoformat()
        return evaluated

    async def restart_operating_system(self) -> None:
        async with httpx.AsyncClient(timeout=self.timeout, verify=True) as client:
            token = await self._token(client)
            await self._post(client, token, "/xapi/v1/Services/Pbx.RestartOperatingSystem")
