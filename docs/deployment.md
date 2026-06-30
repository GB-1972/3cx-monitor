# Deployment Notes

Target: ADICOM server with existing Docker containers.

## Ports

The compose file exposes:

- Frontend: `8088`
- Postgres: internal only

If this port is already in use on the target server, change it in `deploy/docker-compose.yml`.

## First Deployment

Preferred deployment uses prebuilt GitHub Container Registry images. You can use the compose file directly without cloning the repository.

### Without Clone

Download only the stack file:

```bash
curl -L -o docker-compose.yml https://raw.githubusercontent.com/GB-1972/3cx-monitor/main/deploy/docker-compose.yml
nano .env
docker compose up -d
```

Minimal `.env`:

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-this-password
APP_SECRET_KEY=change-this-to-a-long-random-secret
POSTGRES_PASSWORD=change-this-db-password
CORS_ORIGINS=http://SERVER-IP:8088
```

In Portainer, paste `deploy/docker-compose.yml` into a new Stack and either define those variables in the Stack environment or edit the placeholders directly in the YAML.

### With Clone

Clone only if you want the full source tree on the server:

```bash
git clone git@github.com:GB-1972/3cx-monitor.git
cd 3cx-monitor
cp .env.example .env
nano .env
docker compose -f docker-compose.images.yml pull
docker compose -f docker-compose.images.yml up -d
```

If the GHCR packages are private, add GHCR as an authenticated Portainer registry or authenticate Docker first with a GitHub token that has `read:packages`:

```bash
echo "GITHUB_TOKEN_WITH_READ_PACKAGES" | docker login ghcr.io -u GB-1972 --password-stdin
```

For local development or when no registry access is available, build directly on the server:

```bash
docker compose up -d --build
```

Then open:

```text
http://SERVER-IP:8088
```

## Add the First 3CX System

Use the web UI after login:

- Customer name: `ADICOM`
- URL: `https://adicom.on3cx.de`
- API client: `monitoring`
- API secret: enter the real secret in the form

The secret is encrypted before it is stored in the database.

## Reverse Proxy

Put the frontend behind the existing reverse proxy. The frontend container proxies `/api/` to the backend container internally, so only the frontend needs to be public.

Example Caddy target:

```text
reverse_proxy 127.0.0.1:8088
```

## Backup

Back up these items:

- `.env`
- Docker volume `3cx-monitor_postgres_data`

Do not publish `.env`; it contains the application secret and database password.
