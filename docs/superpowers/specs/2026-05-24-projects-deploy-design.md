# PulseNode — Projects & Deploy Feature Design

**Date:** 2026-05-24
**Status:** Approved

---

## Overview

Add a self-hosted PaaS deploy layer to PulseNode. Users connect their GitHub account (OAuth or PAT), pick a repo, configure a domain and environment variables, and deploy with one click. PulseNode clones the repo, auto-detects the build method (Docker Compose → Dockerfile → Nixpacks), builds and runs the container, and wires it into Traefik with automatic TLS.

Build jobs run in a SQLite-backed async queue (max 2 concurrent). Log lines stream live to the browser via the existing SSE hub and are persisted in SQLite for historical review.

---

## Scope

This spec covers **Phases 1–3**. Phase 4 (webhook redeploy, rollback) is a follow-up.

| Phase | Scope |
|-------|-------|
| 1 | GitHub connect (OAuth + PAT), repo browser, project record in SQLite |
| 2 | Deploy pipeline — clone → detect → build → run + Traefik routing |
| 3 | Live log streaming (SSE) + log history in SQLite |
| 4 | (future) Webhook redeploy on git push, rollback, env var management UI |

---

## Sidebar & Routes

New **"Deploy"** section added to the sidebar between Workspace and Resources:

```
Workspace
  Containers · Stats · Processes

Deploy
  Projects          /projects
  GitHub            /github

Resources
  Images · Networks · Databases
```

| Route | Purpose |
|-------|---------|
| `/github` | Connect GitHub account (OAuth + PAT) |
| `/projects` | List all projects |
| `/projects/new` | 3-step wizard: source → configure → deploy |
| `/projects/[id]` | Project detail: live logs, history, settings |

Settings page gets a **GitHub OAuth** card with Client ID and Client Secret fields.

---

## Database Schema

**Engine:** `modernc.org/sqlite` (WAL mode, pure Go, no CGO)
**Queries:** `sqlc` (type-safe generated code from SQL)
**Location:** `/var/lib/pulsenode/pulsenode.db` (existing `pn-go-data` Docker volume)

```sql
-- GitHub credentials (one per connected account)
CREATE TABLE github_accounts (
  id           INTEGER PRIMARY KEY,
  login        TEXT NOT NULL,
  avatar_url   TEXT NOT NULL,
  access_token TEXT NOT NULL,   -- AES-GCM encrypted with AES_KEY
  token_type   TEXT NOT NULL,   -- "oauth" | "pat"
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per deployed project
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,          -- nanoid, e.g. "proj_x7k2m"
  name          TEXT NOT NULL,
  repo_url      TEXT NOT NULL,             -- https://github.com/user/repo
  branch        TEXT NOT NULL DEFAULT 'main',
  build_method  TEXT NOT NULL,             -- "auto"|"compose"|"dockerfile"|"nixpacks"
  build_command TEXT,                      -- optional override
  domain        TEXT NOT NULL,             -- e.g. emerald-fox-42.sakitha.xyz
  env_vars      TEXT NOT NULL DEFAULT '{}', -- JSON map, AES-GCM encrypted
  port          INTEGER NOT NULL DEFAULT 3000, -- container port Traefik routes to
  container_id  TEXT,                      -- current running container ID
  status        TEXT NOT NULL DEFAULT 'idle', -- idle|building|running|failed|stopped
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- One row per deploy attempt
CREATE TABLE deployments (
  id          TEXT PRIMARY KEY,            -- nanoid
  project_id  TEXT NOT NULL REFERENCES projects(id),
  status      TEXT NOT NULL DEFAULT 'queued', -- queued|building|success|failed
  trigger     TEXT NOT NULL DEFAULT 'manual', -- manual|webhook
  commit_sha  TEXT,
  commit_msg  TEXT,
  started_at  DATETIME,
  finished_at DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Append-only log lines per deployment
CREATE TABLE deployment_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL REFERENCES deployments(id),
  stream        TEXT NOT NULL DEFAULT 'stdout', -- stdout|stderr|system
  line          TEXT NOT NULL,
  ts            DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Access tokens and env vars are encrypted with the existing `AES_KEY` before writing. sqlc generates all query functions — no hand-written SQL in handlers.

---

## Go Backend

### New packages

```
backend/internal/
  github/     OAuth flow, PAT validation, repo/branch listing (GitHub REST API)
  builder/    Clone → detect → build → run → Traefik label wiring
  queue/      SQLite-backed job dispatcher, worker pool (max 2 concurrent)
  db/         Extended with SQLite init (WAL mode) + sqlc-generated queries
```

### API routes (all under `/go/api`, auth-gated)

```
# GitHub
GET  /api/github/auth-url              returns OAuth redirect URL
GET  /api/github/callback              exchanges code → token, stores account
DELETE /api/github/account             disconnect (delete github_accounts row)
GET  /api/github/repos                 list user repos (name, default branch, private)
GET  /api/github/branches/:owner/:repo list branches for a repo
POST /api/github/settings              save OAuth client ID + secret to .env.local

# Projects
GET    /api/projects                   list all projects
POST   /api/projects                   create project + queue first deployment
GET    /api/projects/:id               project detail + current status
PUT    /api/projects/:id               update config (domain, env vars, branch, build method)
DELETE /api/projects/:id               stop container + delete project + logs
POST   /api/projects/:id/deploy        queue a new deployment (redeploy)
POST   /api/projects/:id/stop          stop running container, status → stopped

# Deployments
GET  /api/projects/:id/deployments     deployment history list
GET  /api/deployments/:id/logs         full stored log for a past deployment

# Config
GET  /api/config/base-domain           returns BASE_DOMAIN from env for slug generation
```

### Build pipeline (`builder` package)

Runs inside the async queue worker. Steps:

1. **Clone** — `git clone --depth 1 --branch <branch> <repo_url>` into OS temp dir. For private repos, injects the access token into the clone URL.
2. **Detect** build method (unless user forced one):
   - `docker-compose.yml` present → **compose**
   - `Dockerfile` present → **dockerfile**
   - Neither → **nixpacks**
3. **Build & run**:
   - **compose**: `docker compose up -d --build` in the cloned dir
   - **dockerfile**: `docker build -t pulsenode-<proj_id> . && docker run -d --name pulsenode-<proj_id> <image>`
   - **nixpacks**: runs via Docker image `ghcr.io/railwayapp/nixpacks` — no host install required:
     `docker run --rm -v <clonedir>:/app ghcr.io/railwayapp/nixpacks build /app --name pulsenode-<proj_id>`, then `docker run -d --name pulsenode-<proj_id> <image>`
4. **Traefik wiring** — attach labels to the running container via Docker API:
   ```
   traefik.enable=true
   traefik.http.routers.<id>.rule=Host(`<domain>`)
   traefik.http.routers.<id>.entrypoints=websecure
   traefik.http.routers.<id>.tls.certresolver=letsencrypt
   traefik.http.services.<id>.loadbalancer.server.port=<port>
   traefik.docker.network=<TRAEFIK_NETWORK>
   ```
5. **Update DB** — `projects.container_id`, `projects.status = "running"`, `deployments.status = "success"`, `deployments.finished_at`.
6. **Cleanup** — remove temp clone dir.

Each stdout/stderr line from subprocesses is written to both `deployment_logs` (SQLite) and the SSE hub on channel `deploy:<deployment_id>`.

On failure at any step: `deployments.status = "failed"`, `projects.status = "failed"`, final error line appended to logs.

### Job queue (`queue` package)

- On startup, any deployment with `status = "queued"` or `status = "building"` is re-queued (crash recovery).
- Max 2 concurrent workers (configurable via `PULSENODE_MAX_BUILDERS` env var).
- Each worker pulls the oldest `queued` deployment, sets it to `building`, runs the builder, updates status on completion.

---

## Frontend Pages

### `/github` — Connect GitHub

Two cards:

**OAuth card (primary)**
- "Connect with GitHub" button → calls `/api/github/auth-url` → browser redirects to GitHub → GitHub redirects back to `/go/api/github/callback` → Go stores token → frontend polls `/api/config` to detect new account → shows avatar, username, "Disconnect" button.

**PAT card (fallback)**
- Password input + "Verify & Save" button → POST to `/api/github/settings` with PAT → Go validates by calling `GET https://api.github.com/user` → stores if valid.

Settings card (collapsible) for GitHub OAuth App credentials: Client ID field, Client Secret field (masked), Save button.

### `/projects` — Project List

Grid of project cards. Each card shows:
- Project name + repo URL
- Domain (external link)
- Status badge: `idle` (grey) · `building` (amber spinner) · `running` (green) · `failed` (red) · `stopped` (grey)
- Last deployed timestamp
- Actions: Deploy · Settings · Delete

Empty state: centred "New Project" button.

### `/projects/new` — 3-Step Wizard

**Step 1 — Source**
- If GitHub connected: searchable repo dropdown (fetched from `/api/github/repos`), branch selector.
- "Or use a public Git URL" text input as alternative.

**Step 2 — Configure**
```
Name          [_______________]
Domain        [_______________]  [Generate]
Build method  [Auto-detect    ▼]   Auto / Compose / Dockerfile / Nixpacks
Build command [_______________]   (optional override, shown when not Auto)
Port          [3000          ]   (container port Traefik routes to; hidden for Compose)
Environment variables
  [+ Add variable]
  KEY [_________]  VALUE [_________]  [×]   (values masked)
```
Generate button calls `/api/config/base-domain`, appends a random adjective-noun-number slug, fills the Domain field. User can edit freely.

**Step 3 — Deploy**
- Summary card: repo, branch, domain, build method, env var count.
- "Deploy Now" button → POST `/api/projects` → redirects to `/projects/<id>`.

### `/projects/[id]` — Project Detail

Three tabs: **Overview · History · Settings**

**Overview tab**
- Status banner: building (amber, spinner) / running (green) / failed (red) / stopped (grey).
- If deployment active: live log terminal — monospace, dark background, auto-scrolls, SSE channel `deploy:<deployment_id>`. "Building…" spinner in header.
- Current deployment card: commit SHA (linked to GitHub), trigger, started, duration.
- "Redeploy" button (top right). "Stop" button if running.

**History tab**
- Table: Date · Trigger · Commit · Duration · Status.
- Click row → inline log expansion (fetched from `/api/deployments/:id/logs`).

**Settings tab**
- Editable: Name, Branch, Domain, Build method, Build command, Env vars.
- "Save" button (no redeploy). "Save & Redeploy" button.
- Danger zone: "Stop Container" · "Delete Project" (with confirmation dialog, deletes container + DB rows + logs).

---

## Security

- All GitHub tokens stored AES-GCM encrypted (same `AES_KEY` used by existing credential store).
- Env vars stored AES-GCM encrypted; decrypted only in the builder process, never returned to the frontend in plaintext.
- Clone URLs for private repos use `https://<token>@github.com/...` — token never logged.
- `GO_API_AUTH` guards all `/api/*` routes (existing middleware).

---

## Configuration (`.env.local` additions)

```bash
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
BASE_DOMAIN=sakitha.xyz        # used for subdomain generation
TRAEFIK_NETWORK=vps-monitor_proxy
PULSENODE_MAX_BUILDERS=2
```

---

## File Layout Changes

```
backend/
  internal/
    github/      client.go (REST), oauth.go (flow), pat.go (validation)
    builder/     builder.go (pipeline), detect.go (method detection), traefik.go (label wiring)
    queue/       queue.go (dispatcher), worker.go (runner)
    db/          schema.sql, queries.sql, sqlc.yaml, generated/
  cmd/pulsenode/
    main.go      (wire new packages at startup)

app/
  github/        page.tsx
  projects/
    page.tsx     (list)
    new/         page.tsx (wizard)
    [id]/        page.tsx (detail with tabs)

components/
  projects/
    ProjectCard.tsx
    WizardSteps.tsx
    LogTerminal.tsx
    DeploymentHistory.tsx
```

---

## Out of Scope (Phase 4)

- Git push webhooks (auto-redeploy on push)
- Deployment rollback to previous image
- Resource limits per project (CPU/RAM)
- Multi-server / remote Docker host deployments
- GitLab / Bitbucket support
