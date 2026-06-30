# 3CX Monitor

Web dashboard for monitoring multiple 3CX v20 systems through the 3CX XAPI.

## Quick Start

### Server Deployment With Images

```bash
git clone git@github.com:GB-1972/3cx-monitor.git
cd 3cx-monitor
cp .env.example .env
nano .env
docker compose -f docker-compose.images.yml pull
docker compose -f docker-compose.images.yml up -d
```

If the GHCR packages are private, log in on the Docker server first:

```bash
echo "GITHUB_TOKEN_WITH_READ_PACKAGES" | docker login ghcr.io -u GB-1972 --password-stdin
```

### Local Build

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
