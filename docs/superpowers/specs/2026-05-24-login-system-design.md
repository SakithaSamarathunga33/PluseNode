# Login System Implementation Design

**Goal:** Optional single-admin login that locks the entire PulseNode dashboard behind a username/password when enabled, using the existing SQLite database and Go JWT infrastructure.

**Architecture:** Go backend owns authentication (httpOnly cookie with JWT, 30-min sliding window). Next.js middleware enforces the gate on every page. The system is entirely opt-in — if no admin account exists, the dashboard is fully open and behaves exactly as today.

**Tech Stack:** Go (bcrypt, existing JWT/HMAC auth), SQLite (existing `modernc.org/sqlite`), Next.js middleware, React (login page + settings section).

---

## Data Layer

### SQLite — `users` table (added to `db.go` `migrate()`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

Single row only — this is a single-admin system. The presence or absence of a row determines whether auth is enabled.

### DB helper methods (added to `db.go`)

- `GetUser() (*User, error)` — returns the single admin row, or nil if none
- `UpsertUser(username, passwordHash string) error` — insert or replace
- `DeleteUser() error` — removes the admin row (disables auth)

---

## Backend

### New file: `backend/internal/api/auth_handler.go`

**Endpoints (all outside the `s.auth.Require` middleware group):**

#### `GET /api/auth/status`
- Calls `db.GetUser()` — if nil, returns `{"enabled": false, "loggedIn": false}`
- If user exists, validates the `pn_session` cookie JWT
- If valid: **resets the cookie** with a fresh 30-min expiry (sliding window), returns `{"enabled": true, "loggedIn": true, "username": "..."}`
- If invalid/missing: returns `{"enabled": true, "loggedIn": false}`

#### `POST /api/auth/login`
Body: `{"username": "...", "password": "..."}`
- If no user row → 401 (auth not configured)
- Compares password against bcrypt hash (`golang.org/x/crypto/bcrypt`)
- On mismatch → 401 `{"error": "Invalid credentials"}`
- On match → sets `pn_session` httpOnly cookie (SameSite=Lax, Path=/, 30-min MaxAge) containing a JWT signed with `JWT_SECRET`, returns `{"ok": true}`

#### `POST /api/auth/logout`
- Clears `pn_session` cookie (MaxAge=-1), returns `{"ok": true}`

#### `POST /api/auth/setup`
Body: `{"username": "...", "password": "..."}` (requires current password if a user already exists via `"current_password"` field)
- If no existing user: bcrypt-hash the password, call `UpsertUser`, return `{"ok": true}`
- If user exists: verify `current_password` first, then update with new hash
- Password must be ≥ 8 characters (validated server-side)

#### `DELETE /api/auth/setup`
Body: `{"password": "..."}` (must confirm current password to disable)
- Verifies password, calls `DeleteUser`, clears the session cookie, returns `{"ok": true}`

### Modified: `backend/internal/api/middleware.go`

Add cookie-based auth path to the existing JWT middleware. When `GO_API_AUTH` is true OR a user row exists, the `Require` middleware:
1. Checks `Authorization: Bearer` header first (existing behaviour)
2. Falls back to reading the `pn_session` cookie and validating its JWT

Auth is skipped for: `/api/auth/login`, `/api/auth/logout`, `/api/auth/status`, `/api/auth/setup`, `/health`, `/config`, `/events`, `/ws`.

The server checks at startup (and per-request) whether a user row exists to decide if auth is active — no restart needed when the admin enables/disables login via Settings.

### JWT format

Same HMAC-SHA256 scheme already in `auth/middleware.go`. Payload:
```json
{"sub": "username", "exp": <unix-timestamp>}
```
Signed with `JWT_SECRET` env var (falls back to `"pulsenode-dev-secret"`).

---

## Frontend

### New file: `app/login/page.tsx`

Centered card on a dark background matching the PulseNode theme:
- PulseNode logo/wordmark at top
- Username input + Password input
- "Sign in" button (shows spinner while loading)
- Error message on failed login
- On success: redirects to `next` query param or `/`
- On mount: calls `GET /api/auth/status` — if `enabled: false`, immediately redirects to `/`

### New file: `middleware.ts` (Next.js root)

Runs on every request. Matcher excludes `/_next/*`, `/favicon.ico`, `/api/*` (Go handles its own auth).

Logic:
1. `GET /api/auth/status` forwarding the `pn_session` cookie from the incoming request
2. If `enabled: false` → pass through (no login configured)
3. If `enabled: true` and `loggedIn: true` → pass through (also refreshes cookie server-side)
4. If `enabled: true` and `loggedIn: false` → redirect to `/login?next=<pathname>`

The middleware call to `/api/auth/status` on every page load is what implements the sliding window — each page navigation extends the session.

### Modified: `app/settings/page.tsx`

New "Security" section added below the existing version/update section.

**State A — no login configured:**
```
Login protection    [OFF]
─────────────────────────────────────────
Username  [_______________]
Password  [_______________]
Confirm   [_______________]
          [Enable login protection]
```

**State B — login is active:**
```
Login protection    [ON]  Logged in as: admin
─────────────────────────────────────────
Change password
Current password  [_______________]
New password      [_______________]
Confirm new       [_______________]
                  [Update password]

                  [Disable login protection]  ← requires current password in a confirm dialog
```

API calls from settings:
- Load state: `GET /api/auth/status`
- Enable: `POST /api/auth/setup`
- Update password: `POST /api/auth/setup` with `current_password`
- Disable: `DELETE /api/auth/setup` (confirmation modal asks for current password)

---

## Security Notes

- Passwords stored as bcrypt hashes (cost 12)
- `pn_session` cookie is httpOnly + SameSite=Lax — not readable by JavaScript
- The login page itself is not behind the middleware (obviously)
- `/api/auth/*` routes are excluded from the Go auth middleware
- Brute-force: the existing rate limiter (300 req/min per IP) applies to login attempts
- If `JWT_SECRET` env var is not set, the fallback dev secret is used — acceptable for a self-hosted single-user tool

---

## Files Changed / Created

| File | Action |
|------|--------|
| `backend/internal/db/db.go` | Add `users` table to `migrate()`, add `GetUser`, `UpsertUser`, `DeleteUser` |
| `backend/internal/api/auth_handler.go` | New — all 5 auth endpoints |
| `backend/internal/api/middleware.go` | Add cookie fallback to existing JWT check |
| `backend/internal/api/server.go` | Register new auth routes outside the auth group |
| `app/login/page.tsx` | New — login page |
| `middleware.ts` | New — Next.js route guard |
| `app/settings/page.tsx` | Add Security section |
