# Super Sefty Backend

Standalone Node.js API and WebSocket signaling server.

## Local Dev

```bash
pnpm install
pnpm dev
```

The backend listens on `http://localhost:4000` and exposes WebSocket signaling at `ws://localhost:4000/ws` by default.

## Environment

Create backend-local env files only. The server loads `.env.development.local`, `.env.local`, `.env.development`, and `.env` in development, or `.env.production.local`, `.env.local`, `.env.production`, and `.env` in production.

```bash
DATABASE_URL="postgresql://user:password@db-host:5432/dbname?sslmode=require"
JWT_SECRET="replace-with-at-least-32-random-bytes"
API_PORT=4000
WS_PORT=4000
CORS_ORIGIN="https://dashboard.example.com"
```

`JWT_SECRET` must be at least 32 characters. Set `CORS_ORIGIN` to the hosted dashboard origin.

## Build And Start

```bash
pnpm build
pnpm start
```

The backend fails fast if `DATABASE_URL` is missing or unreachable at startup.

## VPS Systemd

Example service:

```ini
[Unit]
Description=Super Sefty Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/super-sefty-backend
EnvironmentFile=/opt/super-sefty-backend/.env
ExecStart=/usr/bin/pnpm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Nginx

```nginx
server {
  listen 80;
  server_name api.example.com;

  location /api/ {
    proxy_pass http://127.0.0.1:4000/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  location /ws {
    proxy_pass http://127.0.0.1:4000/ws;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

Use `https://...` and `wss://...` URLs once TLS is enabled.
