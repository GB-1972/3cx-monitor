# 3CX Monitor

Web dashboard for monitoring multiple 3CX v20 systems through the 3CX XAPI.

## Quick Start

```bash
cp .env.example .env
nano .env
docker compose up -d --build
```

Open `http://SERVER-IP:8088`.

The backend listens on `8089` and the frontend on `8088`. Put Caddy, nginx, or Traefik in front of the frontend for TLS.

## 3CX Requirements

- 3CX v20 with XAPI enabled.
- API client under `Admin -> Integrations -> API`.
- Role should be `System Owner`.
- The monitoring server must be allowed by firewall and 3CX console restrictions.

3CX URLs can use port 443, for example `https://adicom.on3cx.de`.

## Monitored Data

- Reachability and API authentication.
- System status: version, active calls, trunks, extensions, backup timestamp, license/subscription.
- SIP trunks via `/xapi/v1/Trunks`.
- Last 5 event log entries via `/xapi/v1/EventLogs`.
- Backup settings and encryption.
- Console restriction, logging, E.164, CRM, Microsoft Teams, emergency rules, SBC status.

Detailed OS service status is not exposed reliably through the remote XAPI. The dashboard shows the XAPI aggregate `HasNotRunningServices`. For per-service status, add a local agent or SSH check later.

## Security Notes

- Do not put real API secrets into `.env.example`.
- Installation secrets are encrypted in the database using `APP_SECRET_KEY`.
- Keep `.env` out of backups and downloads unless you intentionally include it.

