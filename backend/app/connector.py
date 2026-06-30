from __future__ import annotations

from datetime import datetime, timezone
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

    def _evaluate(self, raw: dict[str, Any]) -> dict[str, Any]:
        system = raw.get("system_status") or {}
        trunks = self._values(raw.get("trunks"))
        events = self._values(raw.get("event_logs"))
        sbcs = self._values(raw.get("sbcs"))
        crm = raw.get("crm_integration") or {}

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

        if crm:
            name = crm.get("Name")
            checks.append(self._health(
                "CRM",
                "warning" if name and name != "CRM.NoneCrmSelected" else "ok",
                f"CRM integration active: {name}" if name and name != "CRM.NoneCrmSelected" else "No CRM integration active",
            ))

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
                "trunks": await self._get(client, token, "/xapi/v1/Trunks", {"$top": 100}),
                "active_calls": await self._get(client, token, "/xapi/v1/ActiveCalls", {"$top": 100, "$orderby": "EstablishedAt asc"}),
                "event_logs": await self._get(client, token, "/xapi/v1/EventLogs", {"$top": 5, "$orderby": "TimeGenerated desc"}),
                "crm_integration": await self._get(client, token, "/xapi/v1/CrmIntegration"),
                "sbcs": await self._get(client, token, "/xapi/v1/Sbcs", {"$top": 100}),
            }
        evaluated = self._evaluate(raw)
        evaluated["checked_at"] = datetime.now(timezone.utc).isoformat()
        return evaluated

    async def restart_operating_system(self) -> None:
        async with httpx.AsyncClient(timeout=self.timeout, verify=True) as client:
            token = await self._token(client)
            await self._post(client, token, "/xapi/v1/Services/Pbx.RestartOperatingSystem")
