# Domain Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Domain page's Save button persist domains to the database as a re-checkable saved list, and show a live inventory of every domain/subdomain in use by containers/projects/Caddy, auto-seeded on a fresh install.

**Architecture:** A new `domains` SQLite table backs a saved-domains registry (CRUD + last DNS-check result). The existing DNS logic is extracted into a reusable `resolveDomain` helper. A live `in-use` inventory merges PulseNode projects, all containers' Traefik `Host()` labels, and Caddy routes, deduped by hostname. On first boot, if the table is empty, discovered hosts are auto-imported.

**Tech Stack:** Go (chi, modernc.org/sqlite, net resolver, Docker Engine API over the host socket), Next.js/React (TypeScript) frontend.

---

## File structure

- `backend/internal/db/db.go` — add `domains` table migration + `Domain` type + CRUD methods. **Modify.**
- `backend/internal/db/db_test.go` — tests for the new domain methods. **Create.**
- `backend/internal/api/domain_handler.go` — extract `resolveDomain` helper; `checkDomain` + `currentDomainSettings` reuse it / read DB primary. **Modify.**
- `backend/internal/api/domains_handler.go` — saved-domain endpoints, Traefik host parser, `discoverInUseHosts`, in-use endpoint, auto-seed. **Create.**
- `backend/internal/api/domains_handler_test.go` — Traefik host parser tests. **Create.**
- `backend/internal/docker/client.go` — add `ContainersWithLabels`. **Modify.**
- `backend/internal/api/server.go` — register the new routes. **Modify.**
- `backend/cmd/pulsenode/main.go` — call `SeedDomainsIfEmpty` at startup. **Modify.**
- `app/domain/page.tsx` — restructured UI (saved domains, in-use, keep records/check). **Modify (rewrite).**

---

## Task 1: `domains` table + DB methods

**Files:**
- Modify: `backend/internal/db/db.go`
- Test: `backend/internal/db/db_test.go` (create)

- [ ] **Step 1: Add the migration**

In `db.go`, inside `migrate()`, append this `CREATE TABLE` to the big SQL string (after the `users` table, before the closing backtick):

```sql
CREATE TABLE IF NOT EXISTS domains (
  id              TEXT PRIMARY KEY,
  host            TEXT NOT NULL UNIQUE,
  is_primary      INTEGER NOT NULL DEFAULT 0,
  last_pointed    INTEGER,
  last_proxied    INTEGER NOT NULL DEFAULT 0,
  last_records    TEXT NOT NULL DEFAULT '[]',
  last_message    TEXT NOT NULL DEFAULT '',
  last_error      TEXT NOT NULL DEFAULT '',
  last_checked_at DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

- [ ] **Step 2: Add `encoding/json` import**

In `db.go` import block, add `"encoding/json"` (currently not imported).

- [ ] **Step 3: Add the `Domain` type + methods**

Append to `db.go` (after the Users section):

```go
// ── Domains ───────────────────────────────────────────────────────────────────

type Domain struct {
	ID            string
	Host          string
	IsPrimary     bool
	LastPointed   *bool // nil = never checked
	LastProxied   bool
	LastRecords   string // JSON array of IPs
	LastMessage   string
	LastError     string
	LastCheckedAt *time.Time
	CreatedAt     time.Time
}

// UpsertDomain inserts the host if absent and returns its row id (existing or new).
func (d *DB) UpsertDomain(host string) (string, error) {
	id := NewID("dom")
	if _, err := d.Exec(`INSERT INTO domains (id, host) VALUES (?, ?) ON CONFLICT(host) DO NOTHING`, id, host); err != nil {
		return "", err
	}
	var got string
	if err := d.QueryRow(`SELECT id FROM domains WHERE host=?`, host).Scan(&got); err != nil {
		return "", err
	}
	return got, nil
}

func (d *DB) ListDomains() ([]Domain, error) {
	rows, err := d.Query(`SELECT id, host, is_primary, last_pointed, last_proxied, last_records, last_message, last_error, last_checked_at, created_at FROM domains ORDER BY is_primary DESC, created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Domain
	for rows.Next() {
		var dm Domain
		var isPrimary, lastProxied int
		var lastPointed sql.NullInt64
		var lastChecked sql.NullTime
		if err := rows.Scan(&dm.ID, &dm.Host, &isPrimary, &lastPointed, &lastProxied, &dm.LastRecords, &dm.LastMessage, &dm.LastError, &lastChecked, &dm.CreatedAt); err != nil {
			return nil, err
		}
		dm.IsPrimary = isPrimary == 1
		dm.LastProxied = lastProxied == 1
		if lastPointed.Valid {
			b := lastPointed.Int64 == 1
			dm.LastPointed = &b
		}
		if lastChecked.Valid {
			t := lastChecked.Time
			dm.LastCheckedAt = &t
		}
		out = append(out, dm)
	}
	return out, rows.Err()
}

// SetPrimaryDomain makes host the single primary domain.
func (d *DB) SetPrimaryDomain(host string) error {
	if _, err := d.Exec(`UPDATE domains SET is_primary=0`); err != nil {
		return err
	}
	_, err := d.Exec(`UPDATE domains SET is_primary=1 WHERE host=?`, host)
	return err
}

// UpdateDomainCheck stores the latest DNS-check result for host.
func (d *DB) UpdateDomainCheck(host string, pointed, proxied bool, records []string, message, errStr string) error {
	recJSON, _ := json.Marshal(records)
	_, err := d.Exec(`UPDATE domains SET last_pointed=?, last_proxied=?, last_records=?, last_message=?, last_error=?, last_checked_at=CURRENT_TIMESTAMP WHERE host=?`,
		boolToInt(pointed), boolToInt(proxied), string(recJSON), message, errStr, host)
	return err
}

func (d *DB) DeleteDomain(host string) error {
	_, err := d.Exec(`DELETE FROM domains WHERE host=?`, host)
	return err
}

// PrimaryDomain returns the host of the primary domain, or "" if none.
func (d *DB) PrimaryDomain() (string, error) {
	var host string
	err := d.QueryRow(`SELECT host FROM domains WHERE is_primary=1 LIMIT 1`).Scan(&host)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	return host, err
}
```

- [ ] **Step 4: Write the failing test**

Create `backend/internal/db/db_test.go`:

```go
package db

import (
	"path/filepath"
	"testing"
)

func newTestDB(t *testing.T) *DB {
	t.Helper()
	d, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return d
}

func TestUpsertDomainIdempotent(t *testing.T) {
	d := newTestDB(t)
	id1, err := d.UpsertDomain("example.com")
	if err != nil {
		t.Fatalf("upsert1: %v", err)
	}
	id2, err := d.UpsertDomain("example.com")
	if err != nil {
		t.Fatalf("upsert2: %v", err)
	}
	if id1 != id2 {
		t.Fatalf("expected same id on re-upsert, got %q then %q", id1, id2)
	}
	list, err := d.ListDomains()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 domain, got %d", len(list))
	}
	if list[0].LastPointed != nil {
		t.Fatalf("expected LastPointed nil before any check")
	}
}

func TestSetPrimaryDomainSingleWinner(t *testing.T) {
	d := newTestDB(t)
	_, _ = d.UpsertDomain("a.com")
	_, _ = d.UpsertDomain("b.com")
	if err := d.SetPrimaryDomain("a.com"); err != nil {
		t.Fatal(err)
	}
	if err := d.SetPrimaryDomain("b.com"); err != nil {
		t.Fatal(err)
	}
	primary, err := d.PrimaryDomain()
	if err != nil {
		t.Fatal(err)
	}
	if primary != "b.com" {
		t.Fatalf("expected primary b.com, got %q", primary)
	}
	list, _ := d.ListDomains()
	count := 0
	for _, dm := range list {
		if dm.IsPrimary {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 primary, got %d", count)
	}
}

func TestUpdateDomainCheckRoundTrip(t *testing.T) {
	d := newTestDB(t)
	_, _ = d.UpsertDomain("a.com")
	if err := d.UpdateDomainCheck("a.com", true, false, []string{"1.2.3.4"}, "ok", ""); err != nil {
		t.Fatal(err)
	}
	list, _ := d.ListDomains()
	if list[0].LastPointed == nil || !*list[0].LastPointed {
		t.Fatalf("expected LastPointed true")
	}
	if list[0].LastRecords != `["1.2.3.4"]` {
		t.Fatalf("expected records JSON, got %q", list[0].LastRecords)
	}
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && go test ./internal/db/ -run TestUpsertDomain -v && go test ./internal/db/ -v`
Expected: PASS for all three tests.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/db/db.go backend/internal/db/db_test.go
git commit -m "feat(db): add domains table and CRUD methods"
```

---

## Task 2: Extract `resolveDomain` helper

**Files:**
- Modify: `backend/internal/api/domain_handler.go`

- [ ] **Step 1: Add the helper**

In `domain_handler.go`, add `"context"` to the import block, then add this function (above `checkDomain`):

```go
// resolveDomain runs the DNS lookup + Cloudflare-proxy detection for host and
// returns a populated response. Records is always a non-nil slice.
func resolveDomain(ctx context.Context, host, expected string) domainCheckResponse {
	res := domainCheckResponse{
		Domain:     host,
		ExpectedIP: expected,
		Records:    []string{},
		CheckedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	if expected == "" {
		res.Error = "Could not determine this VPS public IP"
		return res
	}
	records, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil {
		res.Error = err.Error()
		return res
	}
	for _, record := range records {
		ip := record.IP.String()
		res.Records = append(res.Records, ip)
		if ip == expected {
			res.Pointed = true
		}
	}
	if !res.Pointed && len(res.Records) > 0 && allCloudflareIPs(res.Records) {
		res.Pointed = true
		res.Proxied = true
		res.Provider = "Cloudflare"
		res.Message = "DNS is proxied through Cloudflare, so public DNS returns Cloudflare edge IPs instead of the VPS origin IP."
	}
	return res
}
```

- [ ] **Step 2: Rewrite `checkDomain` to use it**

Replace the body of `checkDomain` (from the `expected := expectedVPSIP()` line through the final `writeJSON`) with:

```go
	res := resolveDomain(r.Context(), domain, expectedVPSIP())
	writeJSON(w, http.StatusOK, res)
```

So the full handler becomes:

```go
func (s *Server) checkDomain(w http.ResponseWriter, r *http.Request) {
	domain := cleanDomain(r.URL.Query().Get("domain"))
	if domain == "" {
		domain = currentDomainSettings().RootDomain
	}
	if domain == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "domain is required"})
		return
	}
	res := resolveDomain(r.Context(), domain, expectedVPSIP())
	writeJSON(w, http.StatusOK, res)
}
```

- [ ] **Step 3: Prefer the DB primary in settings + check**

`currentDomainSettings` is a free function with no DB access. Add two methods on `*Server` that layer the DB primary on top, and point the handlers at them. In `domain_handler.go`, add:

```go
// rootDomain returns the primary saved domain if set, else the env/host fallback.
func (s *Server) rootDomain() string {
	if s.db != nil {
		if primary, err := s.db.PrimaryDomain(); err == nil && primary != "" {
			return primary
		}
	}
	return currentDomainSettings().RootDomain
}

// effectiveDomainSettings is currentDomainSettings() with RootDomain/Aliases
// overridden by the DB primary (so projects/new and the DNS-records section
// reflect the saved primary domain).
func (s *Server) effectiveDomainSettings() domainSettingsResponse {
	base := currentDomainSettings()
	root := s.rootDomain()
	base.RootDomain = root
	if root != "" {
		base.Aliases = []string{"@" + root, "*." + root}
	} else {
		base.Aliases = []string{}
	}
	return base
}
```

Then update the existing `domainSettings` handler to use it:

```go
func (s *Server) domainSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.effectiveDomainSettings())
}
```

And in `checkDomain`, replace `domain = currentDomainSettings().RootDomain` with `domain = s.rootDomain()`.

- [ ] **Step 4: Verify build**

Run: `cd backend && go build ./...`
Expected: no output (success).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/api/domain_handler.go
git commit -m "refactor(api): extract resolveDomain helper, prefer DB primary domain"
```

---

## Task 3: Docker `ContainersWithLabels`

**Files:**
- Modify: `backend/internal/docker/client.go`

- [ ] **Step 1: Add the type + method**

In `client.go`, add near the other type declarations:

```go
type ContainerLabels struct {
	Name   string
	State  string
	Labels map[string]string
}
```

And add this method (mirror the path used by the existing `Containers` method — `/containers/json?all=true`):

```go
// ContainersWithLabels lists all containers with their raw labels, used for
// discovering Traefik/Caddy domain routing labels.
func (c *Client) ContainersWithLabels(ctx context.Context) ([]ContainerLabels, error) {
	var raw []struct {
		Names  []string          `json:"Names"`
		State  string            `json:"State"`
		Labels map[string]string `json:"Labels"`
	}
	if err := c.do(ctx, http.MethodGet, "/containers/json?all=true", nil, &raw); err != nil {
		return nil, err
	}
	out := []ContainerLabels{}
	for _, item := range raw {
		name := ""
		if len(item.Names) > 0 {
			name = strings.TrimPrefix(item.Names[0], "/")
		}
		out = append(out, ContainerLabels{Name: name, State: item.State, Labels: item.Labels})
	}
	return out, nil
}
```

- [ ] **Step 2: Verify build**

Run: `cd backend && go build ./...`
Expected: success. (`net/http` and `strings` are already imported in this file.)

- [ ] **Step 3: Commit**

```bash
git add backend/internal/docker/client.go
git commit -m "feat(docker): add ContainersWithLabels for domain discovery"
```

---

## Task 4: Traefik host parser

**Files:**
- Create: `backend/internal/api/domains_handler.go`
- Test: `backend/internal/api/domains_handler_test.go` (create)

- [ ] **Step 1: Create the file with the parser**

Create `backend/internal/api/domains_handler.go`:

```go
package api

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	"sort"
	"strings"

	"github.com/go-chi/chi/v5"
)

var hostRuleRe = regexp.MustCompile("Host\\(`([^`]+)`\\)")

// parseTraefikHosts extracts every hostname from a container's Traefik router
// rule labels (traefik.http.routers.<name>.rule = Host(`a`) || Host(`b`)).
func parseTraefikHosts(labels map[string]string) []string {
	seen := map[string]bool{}
	var out []string
	for k, v := range labels {
		if !strings.HasPrefix(k, "traefik.http.routers.") || !strings.HasSuffix(k, ".rule") {
			continue
		}
		for _, m := range hostRuleRe.FindAllStringSubmatch(v, -1) {
			h := strings.ToLower(strings.TrimSpace(m[1]))
			if h != "" && !seen[h] {
				seen[h] = true
				out = append(out, h)
			}
		}
	}
	sort.Strings(out)
	return out
}
```

- [ ] **Step 2: Write the failing test**

Create `backend/internal/api/domains_handler_test.go`:

```go
package api

import (
	"reflect"
	"testing"
)

func TestParseTraefikHosts(t *testing.T) {
	cases := []struct {
		name   string
		labels map[string]string
		want   []string
	}{
		{
			name:   "single host",
			labels: map[string]string{"traefik.http.routers.web.rule": "Host(`app.example.com`)"},
			want:   []string{"app.example.com"},
		},
		{
			name:   "alternation",
			labels: map[string]string{"traefik.http.routers.web.rule": "Host(`a.com`) || Host(`b.com`)"},
			want:   []string{"a.com", "b.com"},
		},
		{
			name: "path prefix mixed in",
			labels: map[string]string{
				"traefik.http.routers.api.rule": "Host(`api.example.com`) && PathPrefix(`/v1`)",
			},
			want: []string{"api.example.com"},
		},
		{
			name:   "non-rule labels ignored",
			labels: map[string]string{"traefik.enable": "true", "com.docker.compose.project": "x"},
			want:   nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseTraefikHosts(tc.labels)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
```

- [ ] **Step 3: Run tests to verify they pass**

Run: `cd backend && go test ./internal/api/ -run TestParseTraefikHosts -v`
Expected: PASS (all sub-tests).

- [ ] **Step 4: Commit**

```bash
git add backend/internal/api/domains_handler.go backend/internal/api/domains_handler_test.go
git commit -m "feat(api): add Traefik Host() label parser"
```

---

## Task 5: Saved-domain endpoints + in-use discovery + auto-seed

**Files:**
- Modify: `backend/internal/api/domains_handler.go`

- [ ] **Step 1: Add the response types + list builder**

Append to `domains_handler.go`:

```go
type savedDomain struct {
	Host      string   `json:"host"`
	IsPrimary bool     `json:"isPrimary"`
	Pointed   *bool    `json:"pointed"`
	Proxied   bool     `json:"proxied"`
	Records   []string `json:"records"`
	Message   string   `json:"message,omitempty"`
	Error     string   `json:"error,omitempty"`
	CheckedAt string   `json:"checkedAt,omitempty"`
}

type domainsResponse struct {
	Domains    []savedDomain `json:"domains"`
	ExpectedIP string        `json:"expectedIp"`
	Aliases    []string      `json:"aliases"`
}

func (s *Server) buildDomainsResponse() (domainsResponse, error) {
	settings := s.effectiveDomainSettings()
	resp := domainsResponse{
		Domains:    []savedDomain{},
		ExpectedIP: settings.ExpectedIP,
		Aliases:    settings.Aliases,
	}
	rows, err := s.db.ListDomains()
	if err != nil {
		return resp, err
	}
	for _, dm := range rows {
		var records []string
		_ = json.Unmarshal([]byte(dm.LastRecords), &records)
		if records == nil {
			records = []string{}
		}
		item := savedDomain{
			Host:      dm.Host,
			IsPrimary: dm.IsPrimary,
			Pointed:   dm.LastPointed,
			Proxied:   dm.LastProxied,
			Records:   records,
			Message:   dm.LastMessage,
			Error:     dm.LastError,
		}
		if dm.LastCheckedAt != nil {
			item.CheckedAt = dm.LastCheckedAt.UTC().Format("2006-01-02T15:04:05Z07:00")
		}
		resp.Domains = append(resp.Domains, item)
	}
	return resp, nil
}

func (s *Server) writeDomainsResponse(w http.ResponseWriter) {
	resp, err := s.buildDomainsResponse()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, resp)
}
```

- [ ] **Step 2: Add the CRUD handlers**

Append:

```go
func (s *Server) handleListDomains(w http.ResponseWriter, r *http.Request) {
	s.writeDomainsResponse(w)
}

func (s *Server) handleSaveDomain(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Host string `json:"host"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	host := cleanDomain(body.Host)
	if host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "host is required"})
		return
	}
	if _, err := s.db.UpsertDomain(host); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	res := resolveDomain(r.Context(), host, expectedVPSIP())
	_ = s.db.UpdateDomainCheck(host, res.Pointed, res.Proxied, res.Records, res.Message, res.Error)
	if primary, _ := s.db.PrimaryDomain(); primary == "" {
		_ = s.db.SetPrimaryDomain(host)
		_ = upsertEnvLocal("PULSENODE_ROOT_DOMAIN", host)
		_ = os.Setenv("PULSENODE_ROOT_DOMAIN", host)
	}
	s.writeDomainsResponse(w)
}

func (s *Server) handleRecheckDomain(w http.ResponseWriter, r *http.Request) {
	host := cleanDomain(chi.URLParam(r, "host"))
	if host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "host is required"})
		return
	}
	res := resolveDomain(r.Context(), host, expectedVPSIP())
	_ = s.db.UpdateDomainCheck(host, res.Pointed, res.Proxied, res.Records, res.Message, res.Error)
	s.writeDomainsResponse(w)
}

func (s *Server) handleSetPrimaryDomain(w http.ResponseWriter, r *http.Request) {
	host := cleanDomain(chi.URLParam(r, "host"))
	if host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "host is required"})
		return
	}
	if err := s.db.SetPrimaryDomain(host); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	_ = upsertEnvLocal("PULSENODE_ROOT_DOMAIN", host)
	_ = os.Setenv("PULSENODE_ROOT_DOMAIN", host)
	s.writeDomainsResponse(w)
}

func (s *Server) handleDeleteDomain(w http.ResponseWriter, r *http.Request) {
	host := cleanDomain(chi.URLParam(r, "host"))
	if host == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "host is required"})
		return
	}
	if err := s.db.DeleteDomain(host); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.writeDomainsResponse(w)
}
```

- [ ] **Step 3: Add in-use discovery + handler + auto-seed**

Append:

```go
type inUseRef struct {
	Source string `json:"source"` // project | container | caddy
	Ref    string `json:"ref"`
	Status string `json:"status,omitempty"`
}

type inUseHost struct {
	Host   string     `json:"host"`
	UsedBy []inUseRef `json:"usedBy"`
}

// discoverInUseHosts merges domains from PulseNode projects, all containers'
// Traefik labels, and Caddy routes, deduped by hostname.
func (s *Server) discoverInUseHosts(ctx context.Context) []inUseHost {
	agg := map[string]*inUseHost{}
	add := func(host, source, ref, status string) {
		host = cleanDomain(host)
		if host == "" {
			return
		}
		e := agg[host]
		if e == nil {
			e = &inUseHost{Host: host}
			agg[host] = e
		}
		e.UsedBy = append(e.UsedBy, inUseRef{Source: source, Ref: ref, Status: status})
	}

	if s.db != nil {
		if projects, err := s.db.ListProjects(); err == nil {
			for _, p := range projects {
				if p.Domain != "" {
					add(p.Domain, "project", p.Name, p.Status)
				}
			}
		}
	}
	if s.docker != nil {
		if cs, err := s.docker.ContainersWithLabels(ctx); err == nil {
			for _, c := range cs {
				for _, h := range parseTraefikHosts(c.Labels) {
					add(h, "container", c.Name, c.State)
				}
			}
		}
	}
	if routes, err := s.caddy.ListRoutes(ctx); err == nil {
		for _, rt := range routes {
			for _, m := range rt.Match {
				for _, h := range m.Host {
					add(h, "caddy", rt.ID, "")
				}
			}
		}
	}

	out := make([]inUseHost, 0, len(agg))
	for _, e := range agg {
		out = append(out, *e)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Host < out[j].Host })
	return out
}

func (s *Server) handleInUseDomains(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"hosts": s.discoverInUseHosts(r.Context())})
}

// SeedDomainsIfEmpty imports discovered in-use hosts as saved (non-primary)
// rows the first time the domains table is empty. Best-effort.
func (s *Server) SeedDomainsIfEmpty(ctx context.Context) {
	if s.db == nil {
		return
	}
	existing, err := s.db.ListDomains()
	if err != nil || len(existing) > 0 {
		return
	}
	for _, h := range s.discoverInUseHosts(ctx) {
		_, _ = s.db.UpsertDomain(h.Host)
	}
}
```

- [ ] **Step 4: Verify build**

Run: `cd backend && go build ./... && go test ./internal/api/ -run TestParseTraefikHosts`
Expected: build succeeds, parser test still PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/api/domains_handler.go
git commit -m "feat(api): saved-domain endpoints, in-use discovery, auto-seed"
```

---

## Task 6: Wire routes + startup seed

**Files:**
- Modify: `backend/internal/api/server.go`
- Modify: `backend/cmd/pulsenode/main.go`

- [ ] **Step 1: Register routes**

In `server.go`, find the domain routes block (currently):

```go
		// Domain settings
		r.Get("/domain/settings", s.domainSettings)
		r.Post("/domain/settings", s.saveDomainSettings)
		r.Get("/domain/check", s.checkDomain)
```

Add immediately after it:

```go
		// Saved domains + live inventory
		r.Get("/domains", s.handleListDomains)
		r.Post("/domains", s.handleSaveDomain)
		r.Get("/domains/in-use", s.handleInUseDomains)
		r.Post("/domains/{host}/recheck", s.handleRecheckDomain)
		r.Post("/domains/{host}/primary", s.handleSetPrimaryDomain)
		r.Delete("/domains/{host}", s.handleDeleteDomain)
```

- [ ] **Step 2: Call the seed at startup**

In `main.go`, after the `server := api.NewServer(...)` block and before the goroutines (`go collector.Start(ctx)`), add:

```go
	server.SeedDomainsIfEmpty(context.Background())
```

(`context` is already imported in main.go.)

- [ ] **Step 3: Verify build**

Run: `cd backend && go build ./...`
Expected: success.

- [ ] **Step 4: Commit**

```bash
git add backend/internal/api/server.go backend/cmd/pulsenode/main.go
git commit -m "feat(api): wire domain routes and startup auto-seed"
```

---

## Task 7: Frontend — restructured Domain page

**Files:**
- Modify (rewrite): `app/domain/page.tsx`

- [ ] **Step 1: Replace the file**

Overwrite `app/domain/page.tsx` with:

```tsx
"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Copy, Globe, Plus, RefreshCw, Star, Trash2, XCircle } from "lucide-react"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

type SavedDomain = {
  host: string
  isPrimary: boolean
  pointed: boolean | null
  proxied: boolean
  records: string[] | null
  message?: string
  error?: string
  checkedAt?: string
}

type DomainsResponse = {
  domains: SavedDomain[]
  expectedIp: string
  aliases: string[]
}

type InUseRef = { source: string; ref: string; status?: string }
type InUseHost = { host: string; usedBy: InUseRef[] }

type CheckResult = {
  domain: string
  expectedIp: string
  records: string[] | null
  pointed: boolean
  proxied: boolean
  message?: string
  error?: string
}

function statusOf(d: SavedDomain): { label: string; color: string } {
  if (d.error) return { label: "Error", color: "var(--err)" }
  if (d.pointed === null) return { label: "Unchecked", color: "var(--fg-3)" }
  if (d.proxied) return { label: "Proxied", color: "var(--ok)" }
  if (d.pointed) return { label: "Pointed", color: "var(--ok)" }
  return { label: "Not pointed", color: "var(--err)" }
}

export default function DomainPage() {
  const [data, setData] = useState<DomainsResponse | null>(null)
  const [inUse, setInUse] = useState<InUseHost[]>([])
  const [newDomain, setNewDomain] = useState("")
  const [checkDomain, setCheckDomain] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyHost, setBusyHost] = useState("")
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<CheckResult | null>(null)

  const loadDomains = async () => {
    const r = await fetch(`${GO_API}/api/domains`, { cache: "no-store" })
    if (r.ok) setData(await r.json())
  }

  const loadInUse = async () => {
    const r = await fetch(`${GO_API}/api/domains/in-use`, { cache: "no-store" })
    if (r.ok) {
      const d = await r.json()
      setInUse(d.hosts ?? [])
    }
  }

  useEffect(() => {
    Promise.all([loadDomains(), loadInUse()]).finally(() => setLoading(false))
  }, [])

  const save = async (host: string) => {
    const value = host.trim()
    if (!value) return
    setSaving(true)
    setMessage("")
    try {
      const r = await fetch(`${GO_API}/api/domains`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: value }),
      })
      const d = await r.json()
      if (!r.ok) {
        setMessage(d.error || "Failed to save domain")
        return
      }
      setData(d)
      setNewDomain("")
      await loadInUse()
    } finally {
      setSaving(false)
    }
  }

  const act = async (host: string, action: "recheck" | "primary") => {
    setBusyHost(host)
    try {
      const r = await fetch(`${GO_API}/api/domains/${encodeURIComponent(host)}/${action}`, { method: "POST" })
      if (r.ok) setData(await r.json())
    } finally {
      setBusyHost("")
    }
  }

  const remove = async (host: string) => {
    setBusyHost(host)
    try {
      const r = await fetch(`${GO_API}/api/domains/${encodeURIComponent(host)}`, { method: "DELETE" })
      if (r.ok) setData(await r.json())
    } finally {
      setBusyHost("")
    }
  }

  const check = async () => {
    setChecking(true)
    setMessage("")
    setResult(null)
    try {
      const q = encodeURIComponent(checkDomain)
      const r = await fetch(`${GO_API}/api/domain/check?domain=${q}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) {
        setMessage(d.error || "Failed to check DNS")
        return
      }
      setResult(d)
    } finally {
      setChecking(false)
    }
  }

  const copy = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--fg-3)" }} />
      </div>
    )
  }

  const expectedIp = data?.expectedIp || ""
  const aliases = data?.aliases || []
  const savedHosts = new Set((data?.domains || []).map(d => d.host))

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>Domain</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--fg-3)" }}>
          Save the domains you use, verify their DNS, and see what each container is serving.
        </p>
      </div>

      {/* Saved domains */}
      <section className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <Globe size={16} style={{ color: "var(--acc)" }} />
          <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Saved domains</h2>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newDomain}
            onChange={e => setNewDomain(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") save(newDomain) }}
            placeholder="example.com or app.example.com"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
            style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={() => save(newDomain)}
            disabled={saving || !newDomain.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
            Save
          </button>
        </div>

        {message && (
          <p className="text-xs" style={{ color: message.includes("Failed") ? "var(--err)" : "var(--ok)" }}>{message}</p>
        )}

        <div className="space-y-2">
          {(data?.domains || []).length === 0 && (
            <p className="text-xs" style={{ color: "var(--fg-3)" }}>No saved domains yet.</p>
          )}
          {(data?.domains || []).map(d => {
            const st = statusOf(d)
            const busy = busyHost === d.host
            return (
              <div key={d.host} className="rounded-lg px-3 py-2.5 space-y-1" style={{ background: "var(--bg-3)" }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-xs font-medium" style={{ color: "var(--fg)" }}>{d.host}</code>
                  {d.isPrimary && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "var(--acc)", color: "#fff" }}>Primary</span>
                  )}
                  <span className="text-[11px] font-medium" style={{ color: st.color }}>{st.label}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => act(d.host, "recheck")} disabled={busy} title="Re-check DNS" className="p-1 rounded hover:opacity-80">
                      <RefreshCw size={13} className={busy ? "animate-spin" : ""} style={{ color: "var(--fg-3)" }} />
                    </button>
                    {!d.isPrimary && (
                      <button onClick={() => act(d.host, "primary")} disabled={busy} title="Make primary" className="p-1 rounded hover:opacity-80">
                        <Star size={13} style={{ color: "var(--fg-3)" }} />
                      </button>
                    )}
                    <button onClick={() => remove(d.host)} disabled={busy} title="Delete" className="p-1 rounded hover:opacity-80">
                      <Trash2 size={13} style={{ color: "var(--err)" }} />
                    </button>
                  </div>
                </div>
                <p className="text-[11px] font-mono" style={{ color: "var(--fg-3)" }}>
                  {d.records?.length ? d.records.join(", ") : (d.error || "No A/AAAA records found")}
                </p>
              </div>
            )
          })}
        </div>
      </section>

      {/* DNS records */}
      <section className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>DNS records</h2>
        <p className="text-xs" style={{ color: "var(--fg-3)" }}>Point these records to this VPS IP.</p>
        <div className="space-y-2">
          {aliases.map(alias => (
            <div key={alias} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-3)" }}>
              <code className="text-xs flex-1" style={{ color: "var(--fg)" }}>{alias}</code>
              <span className="text-xs font-mono" style={{ color: "var(--fg-3)" }}>A</span>
              <button onClick={() => copy(expectedIp)} className="p-1 rounded hover:opacity-80" title="Copy IP">
                <Copy size={13} style={{ color: "var(--fg-3)" }} />
              </button>
            </div>
          ))}
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-3)" }}>
          <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--fg-4)" }}>Expected IP</p>
          <p className="text-sm font-mono mt-0.5" style={{ color: "var(--fg)" }}>{expectedIp || "Unknown"}</p>
        </div>
      </section>

      {/* In use */}
      <section className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>In use on this server</h2>
          <button onClick={loadInUse} className="p-1 rounded hover:opacity-80" title="Refresh">
            <RefreshCw size={13} style={{ color: "var(--fg-3)" }} />
          </button>
        </div>
        {inUse.length === 0 && <p className="text-xs" style={{ color: "var(--fg-3)" }}>No domains discovered from containers, projects, or Caddy.</p>}
        <div className="space-y-2">
          {inUse.map(h => (
            <div key={h.host} className="flex items-center gap-2 rounded-lg px-3 py-2 flex-wrap" style={{ background: "var(--bg-3)" }}>
              <code className="text-xs" style={{ color: "var(--fg)" }}>{h.host}</code>
              <span className="text-[11px]" style={{ color: "var(--fg-3)" }}>
                {h.usedBy.map(u => `${u.source}:${u.ref}${u.status ? ` (${u.status})` : ""}`).join(", ")}
              </span>
              <div className="ml-auto">
                {savedHosts.has(h.host) ? (
                  <span className="text-[11px]" style={{ color: "var(--ok)" }}>Saved</span>
                ) : (
                  <button onClick={() => save(h.host)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded hover:opacity-80" style={{ background: "var(--acc)", color: "#fff" }}>
                    <Plus size={11} /> Save
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Ad-hoc check */}
      <section className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Check DNS</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={checkDomain}
            onChange={e => setCheckDomain(e.target.value)}
            placeholder="example.com or app.example.com"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
            style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={check}
            disabled={checking || !checkDomain.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
          >
            {checking ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
            Check
          </button>
        </div>

        {result && (
          <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              {result.pointed ? (
                <CheckCircle2 size={18} style={{ color: "var(--ok)" }} />
              ) : (
                <XCircle size={18} style={{ color: "var(--err)" }} />
              )}
              <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {result.pointed ? (result.proxied ? "Domain is proxied through Cloudflare" : "Domain is pointed correctly") : "Domain is not pointed to this VPS"}
              </p>
            </div>
            {result.message && <p className="text-xs" style={{ color: "var(--fg-3)" }}>{result.message}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="Expected IP" value={result.expectedIp || "Unknown"} />
              <Info label="Resolved IPs" value={result.records?.length ? result.records.join(", ") : "No A/AAAA records found"} />
            </div>
            {result.error && <p className="text-xs" style={{ color: "var(--err)" }}>{result.error}</p>}
          </div>
        )}
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-3)" }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--fg-4)" }}>{label}</p>
      <p className="text-xs font-mono mt-0.5 break-all" style={{ color: "var(--fg)" }}>{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep "domain/page" || echo "clean"`
Expected: `clean` (no errors on the domain page).

- [ ] **Step 3: Commit**

```bash
git add app/domain/page.tsx
git commit -m "feat(web): saved domains list + in-use inventory on Domain page"
```

---

## Task 8: Full verification + graph update

**Files:** none (verification only)

- [ ] **Step 1: Backend build + tests**

Run: `cd backend && go build ./... && go test ./...`
Expected: build succeeds; db + api package tests PASS.

- [ ] **Step 2: Frontend typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "app/domain|domains" || echo "clean"`
Expected: `clean`.

- [ ] **Step 3: Rebuild and run the stack**

Run: `docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d --build go-api web`
Expected: both images build, containers recreated.

- [ ] **Step 4: Manual smoke test**

In the UI Domain page: Save a domain → it appears with a status pill; click Re-check → status updates; click the star on a non-primary → Primary badge moves; the "In use on this server" section lists the PulseNode/Traefik containers' hosts. On a DB with an empty `domains` table, those hosts are auto-seeded into Saved domains after a restart.

- [ ] **Step 5: Update the knowledge graph**

Run: `graphify update /home/sakitha/apps/vps`
Expected: rebuild reports the new `domains_handler.go` etc. indexed.

- [ ] **Step 6: Commit graph + final**

```bash
git add graphify-out
git commit -m "chore: update knowledge graph for domain management feature"
```

---

## Notes for the implementer

- All `/api/*` routes here are auth-gated; you cannot curl them without a token. Verify backend logic via `go test` and the UI, per the project's CLAUDE.md.
- `decodeJSON`, `writeJSON`, `upsertEnvLocal`, `firstNonEmpty`, `cleanDomain`, `expectedVPSIP`, `currentDomainSettings`, and `allCloudflareIPs` already exist in the `api` package — reuse them, do not redefine.
- `chi.URLParam(r, "host")` extracts the `{host}` path segment; the frontend `encodeURIComponent`s it.
- Keep `Records` initialised to `[]string{}` everywhere (the existing nil-slice → JSON `null` → client crash fix).
```
