# Deployment Notes

Target: ADICOM server with existing Docker containers.

## Ports

The compose file exposes:

- Frontend: `8088`
- Backend API: `8089`
- Postgres: internal only

If these ports are already in use on the target server, change them in `docker-compose.yml`.

## First Deployment

```bash
tar xzf 3cx-monitor.tar.gz
cd 3cx-monitor
cp .env.example .env
nano .env
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

