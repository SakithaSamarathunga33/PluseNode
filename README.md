# PulseNode

A self-hosted VPS monitoring dashboard — containers, system stats, processes, databases, networks, images, Coolify projects, vulnerability scans, SBOMs, and live alerts. All from one clean interface.

![PulseNode dashboard](public/Screenshot%202026-05-20%20065221.png)

---

## One-command deploy

```bash
git clone https://github.com/SakithaSamarathunga33/vps.git
cd vps
./deploy.sh
```

The script detects your server's public IP, writes the config, builds all three Docker images, and starts everything behind Nginx on port 80. When it finishes you'll see:

```
  Dashboard   →  http://YOUR_IP/
  Containers  →  http://YOUR_IP/containers
  Stats       →  http://YOUR_IP/stats
  Processes   →  http://YOUR_IP/processes
  Databases   →  http://YOUR_IP/databases
  Networks    →  http://YOUR_IP/networks
```

### Requirements

| Requirement | Version |
|------------|---------|
| Docker | 24+ |
| Docker Compose plugin (v2) | 2.20+ |
| Linux VPS | Any distro with Docker |
| Open port | 80 (or custom via `LISTEN_PORT`) |

> The Node.js API mounts `/var/run/docker.sock` to read containers, images, and networks from the host Docker daemon.

---

## How it works

```
Browser
  │
  ▼
Nginx :80
  ├─ /api/*        ──▶  Node.js API  :4001   (Docker, PM2, host info)
  ├─ /socket.io/*  ──▶  Node.js API  :4001   (live metrics via WebSocket)
  ├─ /metrics/*    ──▶  Python API   :8001   (psutil — CPU, RAM, disk, net)
  ├─ /database/*   ──▶  Python API   :8001   (Postgres introspection)
  ├─ /security/*   ──▶  Python API   :8001   (Trivy scans, SBOMs)
  └─ /*            ──▶  Next.js web  :3000   (dashboard UI)
```

All internal services bind to `127.0.0.1` only — Nginx is the sole public entry point.

---

## Manual configuration

If you prefer to set things up yourself instead of running `deploy.sh`:

```bash
cp .env.example .env.local
nano .env.local          # fill in your VPS IP or domain
docker compose -f docker-compose.yml -f docker-compose.standalone.yml up -d --build
```

### `.env.local` reference

```bash
# Public URLs — all set to the same host since Nginx routes internally
NEXT_PUBLIC_ORIGIN=http://YOUR_VPS_IP
NEXT_PUBLIC_NODE_API=http://YOUR_VPS_IP
NEXT_PUBLIC_PYTHON_API=http://YOUR_VPS_IP
NEXT_PUBLIC_WS_URL=ws://YOUR_VPS_IP

# Internal port bindings (localhost only)
WEB_PORT=127.0.0.1:3000
NODE_PORT=127.0.0.1:4001
PYTHON_PORT=127.0.0.1:8001

# API authentication
NODE_API_AUTH=false
NODE_API_SECRET=your-random-secret   # openssl rand -hex 32

# Optional — enables the Coolify tab with real project/deployment data
COOLIFY_API_URL=https://coolify.example.com
COOLIFY_API_TOKEN=your-coolify-token

# Optional — enables real table sizes and slow-query data in the Databases tab
DATABASE_URL=postgresql://user:password@host:5432/dbname
```

---

## Updating

```bash
git pull
./deploy.sh
```

The script re-runs the full build. Docker layer caching keeps it fast after the first run.

---

## Stopping

```bash
docker compose -f docker-compose.yml -f docker-compose.standalone.yml down
```

---

## Custom port

To run on a port other than 80 (e.g. 8080):

```bash
LISTEN_PORT=8080 docker compose -f docker-compose.yml -f docker-compose.standalone.yml up -d --build
```

---

## Optional integrations

### Coolify

Set `COOLIFY_API_URL` and `COOLIFY_API_TOKEN` in `.env.local`. The Coolify tab will show real projects, applications, databases, services, and deployment history from the Coolify REST API. Without these values it falls back to Docker label detection.

### PostgreSQL introspection

Set `DATABASE_URL` to a Postgres connection string. The Databases tab will display real table names, row counts, sizes, and slow queries via `pg_stat_statements`.

### Trivy vulnerability scanning

Install [Trivy](https://aquasecurity.github.io/trivy/) on the host:

```bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh
```

The Python API will detect it automatically. The Scan History tab will run real scans and persist results to `python/scans.json`.

---

## Deploying with HTTPS

If you have a domain and want SSL, point your domain at the VPS, install Caddy or Certbot, then run `deploy.sh` and answer **y** to the HTTPS question. Or use the Coolify deploy path below which handles TLS automatically.

---

## Coolify deployment (existing Coolify users)

If your VPS already runs Coolify, the repo includes a Traefik overlay at `docker-compose.override.yml`. Coolify picks this up automatically and handles routing and SSL:

```bash
# In the Coolify UI: Add a Docker Compose resource, point at this repo.
# Set build environment variables:
NEXT_PUBLIC_ORIGIN=https://your-domain.com
NEXT_PUBLIC_NODE_API=https://your-domain.com
NEXT_PUBLIC_PYTHON_API=https://your-domain.com
NEXT_PUBLIC_WS_URL=wss://your-domain.com
```

Coolify's Traefik will route traffic identically to the standalone Nginx config.

---

## Architecture

```
vps/
├─ app/               Next.js 14 app router pages
│   ├─ containers/    Docker container dashboard
│   ├─ stats/         CPU, RAM, disk, network charts
│   ├─ processes/     System process list (psutil)
│   ├─ databases/     Database container introspection
│   ├─ networks/      Docker network topology
│   ├─ images/        Docker image list with vuln counts
│   ├─ coolify/       Coolify projects and deployments
│   ├─ alerts/        Live alert feed (socket.io)
│   ├─ scan-history/  Trivy vulnerability scan results
│   └─ sbom-history/  Software bill of materials
├─ server/            Node.js / Express
│   ├─ docker.js      Dockerode — containers, images, networks
│   ├─ host.js        OS metrics — CPU, RAM, disk, net (/proc/net/dev)
│   ├─ pm2.js         PM2 process list
│   └─ coolify.js     Coolify API + Docker label detection
├─ python/            FastAPI
│   ├─ metrics.py     psutil — per-core CPU, RAM, disk I/O, net rates
│   ├─ database.py    asyncpg — Postgres introspection
│   └─ security.py    Trivy subprocess + SBOM management
├─ components/        Sidebar, stat cards, charts, UI primitives
├─ lib/               API clients, socket, types, mock fallbacks
├─ nginx.conf         Reverse proxy routing rules
├─ docker-compose.yml Base service definitions
├─ docker-compose.standalone.yml  Nginx entry point (used by deploy.sh)
├─ docker-compose.override.yml    Coolify / Traefik labels
├─ Dockerfile         Multi-stage: Next.js build + Node.js API
├─ Dockerfile.python  Python FastAPI service
└─ deploy.sh          One-command deploy script
```

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Animations | GSAP, Framer Motion |
| Charts | Recharts |
| Real-time | Socket.IO |
| Node API | Express, Dockerode, PM2 |
| Python API | FastAPI, psutil, asyncpg |
| Proxy | Nginx (standalone) / Traefik (Coolify) |
| Containers | Docker, Docker Compose |
