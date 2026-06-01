# Domain Management — DB-backed saved domains + live discovery

**Date:** 2026-06-01
**Status:** Approved (design)

## Problem

The Domain page's **Save** button only writes the root domain to `.env.local`
(`PULSENODE_ROOT_DOMAIN`) — a single value, not durable in the database, with no
history and no way to re-check it later. Users want to:

1. Save a domain to the database when they press **Save**.
2. Save many domains over time, each re-checkable anytime.
3. See which domains/subdomains each container or website on the server is using.
4. On a fresh install on someone else's box, auto-discover the existing systems
   and the domains already connected, and show them.

## Decisions (from brainstorming)

- **Discovery source:** all running containers (Traefik `Host()` labels) + Caddy
  routes + PulseNode projects, merged live on each load. Not limited to PulseNode
  projects.
- **Save model:** each Save adds a row to a new `domains` table; the page lists
  all saved domains with their last DNS-check result and a re-check button; one
  row is flagged primary.
- **Auto-seed:** on first boot, if the `domains` table is empty, import the
  discovered in-use hosts as saved (non-primary) rows. Runs only while the list
  is empty.

## Data model

New table (migration in `backend/internal/db/db.go`):

```sql
CREATE TABLE IF NOT EXISTS domains (
  id              TEXT PRIMARY KEY,
  host            TEXT NOT NULL UNIQUE,
  is_primary      INTEGER NOT NULL DEFAULT 0,
  last_pointed    INTEGER,                      -- NULL=never checked, 0=no, 1=yes
  last_proxied    INTEGER NOT NULL DEFAULT 0,
  last_records    TEXT NOT NULL DEFAULT '[]',   -- JSON array of resolved IPs
  last_message    TEXT NOT NULL DEFAULT '',
  last_error      TEXT NOT NULL DEFAULT '',
  last_checked_at DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Invariant: at most one row has `is_primary=1`, enforced in code (`SetPrimaryDomain`
clears all others in the same transaction before setting the target).

### DB methods (`db.go`)

- `UpsertDomain(host string) (string, error)` — insert if absent (generate id via
  `NewID("dom")`), no-op on conflict; returns the row id.
- `ListDomains() ([]Domain, error)` — ordered primary-first then `created_at`.
- `SetPrimaryDomain(host string) error` — clear all `is_primary`, set the target.
- `UpdateDomainCheck(host string, pointed, proxied bool, records []string, message, errStr string) error`
  — store last check; `records` marshalled to JSON; sets `last_checked_at`.
  `pointed` stored as 0/1 (never NULL once checked).
- `DeleteDomain(host string) error`.
- `PrimaryDomain() (string, error)` — host of the primary row, or "".

`Domain` struct mirrors the columns; `LastPointed` is `*bool` (NULL = never checked).

## Backend

### Shared DNS helper (`domain_handler.go`)

Extract the body of the current `checkDomain` into a pure helper:

```go
func resolveDomain(ctx context.Context, host, expectedIP string) domainCheckResponse
```

It performs the lookup, Cloudflare-proxy detection, and returns the populated
`domainCheckResponse` (with `Records` already initialised to `[]string{}` per the
existing nil-slice fix). Both the ad-hoc checker and the saved-domain endpoints
call it. The existing `GET /api/domain/check` handler becomes a thin wrapper.

### Saved-domain endpoints (registered in `server.go`)

- `GET /api/domains` → `{ domains: [...], expectedIp, aliases }`. Each domain item:
  `{ host, isPrimary, pointed (bool|null), proxied, records, message, error, checkedAt }`.
- `POST /api/domains` `{ host }` → `cleanDomain(host)`; reject empty (400);
  `UpsertDomain`; run `resolveDomain`; `UpdateDomainCheck`; if this is the only
  row, `SetPrimaryDomain` + sync env. Returns the saved item. **This is the new
  behaviour of the Save button.**
- `POST /api/domains/{host}/recheck` → `resolveDomain` + `UpdateDomainCheck`;
  returns the updated item.
- `POST /api/domains/{host}/primary` → `SetPrimaryDomain`; sync env
  (`upsertEnvLocal("PULSENODE_ROOT_DOMAIN", host)` + `os.Setenv`). Returns 200.
- `DELETE /api/domains/{host}` → `DeleteDomain`. If the deleted row was primary,
  leave env as-is (a later Save/primary action overwrites it).

`currentDomainSettings()` resolves `RootDomain` from `PrimaryDomain()` first,
then the existing env/host/URL fallbacks, so `projects/new` subdomain suggestions
keep working before anything is saved.

### Live "in use" inventory

Docker client (`backend/internal/docker/client.go`): add label decoding. The
`/containers/json` payload already includes `Labels`; add

```go
func (c *Client) ContainersWithLabels(ctx context.Context) ([]ContainerLabels, error)
// ContainerLabels{ Name, State string; Labels map[string]string }
```

New handler `GET /api/domains/in-use` returns a deduped list merged from three
sources:

1. **projects** (`db.ListProjects`) → `{ host: project.Domain, source:"project", ref: name, status }` (skip empty domains).
2. **containers** (`ContainersWithLabels`) → for each container, scan
   `traefik.http.routers.*.rule` label values and extract every ``Host(`x`)``
   hostname (regex ``Host\(` + "`" + `([^` + "`" + `]+)` + "`" + `\)``, applied repeatedly;
   handles `||` and comma lists) → `{ host, source:"container", ref: container name, status: state }`.
3. **Caddy** (`s.caddy.ListRoutes`) → `{ host, source:"caddy", ref: upstream }`.

Merge by lowercased hostname; one entry per host with a `usedBy: [{source, ref, status}]`
array. In-use rows are **not** DNS-checked on load (keeps the page fast); a check
runs only when the user Saves/tracks one.

A small exported helper `discoverInUseHosts(ctx) []InUse` backs both this endpoint
and the auto-seed.

### Auto-seed on first boot

In server startup (where `db` is already open), after migration:

```go
if existing, _ := db.ListDomains(); len(existing) == 0 {
    for _, h := range discoverInUseHosts(ctx) {
        _, _ = db.UpsertDomain(h.Host)   // non-primary, unchecked
    }
}
```

Best-effort (errors ignored — discovery failing must not block boot). Runs only
while the table is empty, so it never fights later user curation.

## Frontend (`app/domain/page.tsx`)

Restructure into sections (reuse existing styling tokens and the `Info` component):

- **Saved domains** (new, top): the Save input + a list fetched from
  `GET /api/domains`. Each row: host · `PRIMARY` badge · status pill
  (OK / Proxied / Not pointed / Error / Unchecked, derived from `pointed`/`proxied`/`error`)
  · resolved IPs · buttons `[Recheck]` `[Make primary]` `[Delete]`. Save posts to
  `POST /api/domains` and refreshes the list.
- **DNS records** (keep): expected IP + alias A-records for the primary domain.
- **In use on this server** (new): table from `GET /api/domains/in-use` — host,
  used-by (project/container/caddy + status), and a `[Save]` button that posts the
  host to `POST /api/domains`.
- **Check DNS** (keep): ad-hoc one-off checker (unchanged, already null-safe).

All requests use the existing `GO_API` base pattern. No new client deps.

## Testing / verification

- **Go unit tests:**
  - Traefik `Host()` parser: single host, multiple `Host()` in one rule, `||`
    alternation, quotes/backticks, no-match → empty.
  - Domain DB methods: upsert idempotency; `SetPrimaryDomain` leaves exactly one
    primary; `UpdateDomainCheck` round-trips records JSON.
- `cd backend && go build ./...` passes; `go test ./...` passes.
- **Frontend:** `npx tsc --noEmit` clean.
- **Manual:** Save a domain → appears with a status pill; Recheck updates it;
  Make primary moves the badge and updates project-subdomain suggestion; In-use
  lists the PulseNode/Traefik containers' hosts; a fresh DB auto-seeds them.

## Out of scope (YAGNI)

- Per-row scheduled/background re-checking (checks are on-demand).
- Editing/registering DNS at a provider — this only reads/verifies DNS.
- Multi-tenant ownership of domains (single-admin model, as elsewhere).
