# PulseNode — Agent Context

## Project Overview

PulseNode is a self-hosted VPS management dashboard. It runs on a single VPS and lets you monitor Docker containers, manage databases, deploy GitHub projects, and more.

**Live URL:** https://vps.sakitha.com  
**VPS IP:** 116.203.30.53  
**Domain:** sakitha.com (wildcard A record `*` → 116.203.30.53 for deployed project subdomains)

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS |
| Backend | Go (Chi router), SQLite (modernc.org/sqlite, WAL mode, pure Go) |
| Reverse proxy | Caddy v2 (behind Traefik v3) |
| Container runtime | Docker |
| Build pipeline | git clone → Compose / Dockerfile / Nixpacks |
| Real-time | WebSocket (Socket.IO) for live logs and stats |

---

## Architecture

```
Browser
  └─► Traefik v3 (ports 80/443, network: vps-monitor_proxy)
        ├─► Caddy (vps.sakitha.com) → Next.js frontend :3000
        │                           → Go API :4002  (/go/*)
        └─► pn-<project> containers (*.sakitha.com subdomains, Traefik labels)
```

- Caddy proxies `/go/*` to the Go API and strips the `/go` prefix.
- Deployed project containers get Traefik labels set at runtime so Traefik routes their subdomain directly without going through Caddy.
- `flush_interval -1` is set in Caddyfile on the `/go/*` block to prevent buffering of streaming responses.

---

## Environment

All secrets live in `.env.local` (never committed). Key variables:

```
NEXT_PUBLIC_ORIGIN=https://vps.sakitha.com
NEXT_PUBLIC_GO_API=https://vps.sakitha.com/go
JWT_SECRET=<hex>
AES_KEY=<hex>                         # encrypts GitHub tokens and env vars in SQLite
MASTER_ENCRYPTION_KEY=<hex>
TRAEFIK_HOST=vps.sakitha.com
TRAEFIK_NETWORK=vps-monitor_proxy
GITHUB_CLIENT_ID=Ov23livG1NcaRdUgW7Yy
GITHUB_CLIENT_SECRET=<secret>
DATABASE_PATH=/data/pulsenode.db
```

The Go API container mounts a named volume `pn-sqlite-data:/data` for the SQLite database.

---

## Key Files

### Backend (`backend/`)

| File | Purpose |
|------|---------|
| `cmd/pulsenode/main.go` | Entry point — opens DB, creates queue, starts API server |
| `internal/api/server.go` | Chi router setup, all route registrations |
| `internal/api/github_handler.go` | GitHub OAuth + PAT connect/disconnect, repo/branch listing, OAuth app settings |
| `internal/api/projects_handler.go` | CRUD for projects, deploy trigger, deployment history, log endpoints, free-port finder |
| `internal/api/http.go` | Shared HTTP helpers including `upsertEnvLocal` |
| `internal/builder/builder.go` | Clone → detect method → build → run container pipeline |
| `internal/docker/client.go` | Docker socket client (containers, images, networks, databases, stats) |
| `internal/db/` | SQLite schema and query helpers |
| `internal/queue/` | Async job queue with worker pool and crash recovery |
| `internal/hub/hub.go` | SSE/WebSocket event broadcaster (Subscribe/Unsubscribe) |

### Frontend (`app/`)

| Route | File | Purpose |
|-------|------|---------|
| `/github` | `app/github/page.tsx` | Connect GitHub account (OAuth or PAT) + OAuth App Settings |
| `/projects` | `app/projects/page.tsx` | List all deployed projects |
| `/projects/new` | `app/projects/new/page.tsx` | 3-step wizard: repo picker → configure → deploy |
| `/projects/[id]` | `app/projects/[id]/page.tsx` | Project detail: Logs, History, Settings tabs |
| `/containers` | `app/containers/page.tsx` | Container table with real CPU/RAM stats |

---

## GitHub Integration

- **OAuth flow:** Go API stores client ID/secret (encrypted). Auth URL redirects to GitHub, callback exchanges code for token, stores encrypted token in SQLite.
- **PAT flow:** User pastes token, API validates against `https://api.github.com/user`, stores encrypted.
- **Token encryption:** AES-GCM using `AES_KEY` env var.
- **OAuth App callback URL:** `https://vps.sakitha.com/go/api/github/callback`
- The OAuth App Settings tab on `/github` lets new users configure their own GitHub OAuth App credentials.

---

## Deploy Pipeline

1. User picks repo + branch in wizard, sets name/domain/port/build method/env vars.
2. POST `/api/projects` creates project record in SQLite.
3. POST `/api/projects/:id/deploy` creates a Deployment record (status: `queued`), enqueues a job.
4. Worker picks up job: clones repo → detects/runs build method → starts container with Traefik labels.
5. Each log line is broadcast via the hub to any connected WebSocket clients.
6. Frontend listens on existing WebSocket (`getSocket()`) for `deploy:log` events, filtered by `deploymentId`.
7. Historical logs are fetched via plain JSON (`GET /api/projects/:id/deployments/:depId/logs`).

### Build Method Detection (auto)

Priority order: `docker-compose.yml` → `Dockerfile` → Nixpacks

### Container Naming

Builder uses `pn-<sanitized-project-name>` for both image and container name. `sanitizeName` lowercases and replaces non-alphanumeric characters with hyphens.

### Domain Generation

`/projects/new` wizard:
- Domain field is empty by default.
- "Generate" button produces `<random-adjective-noun-number>.sakitha.com`.
- Port is auto-fetched from `GET /api/projects/free-port` (first unused port ≥ 3000).

---

## Docker Container Stats

Real CPU and RAM are fetched from the Docker socket (`/containers/{id}/stats?stream=false&one-shot=true`) concurrently per running container with a 4-second timeout each. Values update every 5 seconds via WebSocket. Previous values are kept until the next update.

**CPU formula:** `(cpuDelta / sysDelta) * numCPU * 100`  
**RAM formula:** `(usage - cache) / limit * 100`

---

## Port Display

The containers table shows:
- `32771→5432/tcp` — host port bound (host→container)
- `3000/tcp` — internal port only (no host binding)

Duplicate IPv4/IPv6 entries from the Docker API are deduplicated.

---

## Deployment Commands

```bash
# Build and redeploy all services
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.traefik.yml up -d --build

# Rebuild only the Go API
docker compose --env-file .env.local -f docker-compose.yml -f docker-compose.traefik.yml up -d --build go-api

# View Go API logs
docker logs vps-go-api-1 -f

# View frontend logs
docker logs vps-web-1 -f
```

---

## Known Constraints

- **HTTP/2 + SSE:** Traefik terminates HTTP/2; SSE-via-fetch fails with `ERR_HTTP2_PROTOCOL_ERROR`. Live logs use the existing WebSocket instead.
- **Go version:** `golang.org/x/sys` requires Go ≥ 1.25.0. Dockerfile uses `golang:1.25-alpine`; `go.mod` declares `go 1.25.0`.
- **SQLite driver:** `modernc.org/sqlite` (pure Go, no CGO). WAL mode enabled.
- **Git + Docker CLI** are installed in the Go API container runtime image (`apk add git docker-cli`).
- **`lucide-react` version** in this project does not include a `Github` icon — use `GitFork` instead.
