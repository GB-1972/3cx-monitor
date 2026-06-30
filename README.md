# 3CX Monitor

Web dashboard for monitoring multiple 3CX v20 systems through the 3CX XAPI.

## Quick Start

### Server Deployment With Images

You do not need to clone the repository if your Docker host or Portainer only needs a stack file. Use `deploy/docker-compose.yml` as the ready-to-run stack file and set the variables in Portainer or in a local `.env`.

For Portainer: create a new Stack, paste the content of `deploy/docker-compose.yml`, change the placeholder values, and deploy.

```bash
curl -L -o docker-compose.yml https://raw.githubusercontent.com/GB-1972/3cx-monitor/main/deploy/docker-compose.yml
nano .env
docker compose up -d
```

Required `.env` values:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
APP_SECRET_KEY=change-this-to-a-long-random-secret
POSTGRES_PASSWORD=change-this-db-password
CORS_ORIGINS=http://SERVER-IP:8088
```

If you prefer working from the repo:

```bash
git clone git@github.com:GB-1972/3cx-monitor.git
cd 3cx-monitor
cp .env.example .env
nano .env
docker compose -f docker-compose.images.yml pull
docker compose -f docker-compose.images.yml up -d
```

If the GHCR packages are private, configure GHCR as an authenticated registry in Portainer, or log in on the Docker server first:

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

The frontend listens on `8088` and proxies `/api` to the backend internally. Put Caddy, nginx, or Traefik in front of the frontend for TLS.

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
