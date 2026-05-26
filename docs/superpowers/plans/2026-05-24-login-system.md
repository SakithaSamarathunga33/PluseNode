# Login System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional single-admin login that locks the entire PulseNode dashboard behind a username/password when enabled, with 30-minute sliding sessions stored in an httpOnly cookie.

**Architecture:** Go backend manages all auth logic (bcrypt passwords in SQLite, JWT cookies, 5 new endpoints). Next.js middleware checks session status on every page request and redirects to `/login` when auth is enabled but the visitor is unauthenticated. The Settings page gains a Security section for enabling/disabling/changing the login.

**Tech Stack:** Go (`golang.org/x/crypto/bcrypt`, existing HMAC-SHA256 JWT), SQLite (`modernc.org/sqlite` — already in use), Next.js middleware (Edge runtime, `fetch`).

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `backend/go.mod` + `go.sum` | Modify | Add `golang.org/x/crypto` dependency |
| `backend/internal/db/db.go` | Modify | Add `users` table + `GetUser`, `UpsertUser`, `DeleteUser` |
| `backend/internal/auth/middleware.go` | Modify | Add exported `MakeJWT` + `ValidateToken` methods |
| `backend/internal/api/auth_handler.go` | Create | 5 auth endpoints |
| `backend/internal/api/middleware.go` | Modify | Add `requireAuth` middleware (cookie + Bearer) |
| `backend/internal/api/server.go` | Modify | Register auth routes + swap to `requireAuth` |
| `app/login/page.tsx` | Create | Login page |
| `middleware.ts` | Create | Next.js route guard (project root) |
| `app/settings/page.tsx` | Modify | Add Security section |

---

## Task 1: Add bcrypt dependency

**Files:**
- Modify: `backend/go.mod`

- [ ] **Step 1: Add the dependency**

```bash
cd /home/sakitha/apps/vps/backend && go get golang.org/x/crypto/bcrypt && go mod tidy
```

Expected: `go.mod` now contains `golang.org/x/crypto` under `require`.

- [ ] **Step 2: Verify build still passes**

```bash
cd /home/sakitha/apps/vps/backend && go build ./...
```

Expected: no output (clean build).

- [ ] **Step 3: Commit**

```bash
cd /home/sakitha/apps/vps && git add backend/go.mod backend/go.sum
git commit -m "chore: add golang.org/x/crypto for bcrypt"
```

---

## Task 2: Add users table + DB helpers

**Files:**
- Modify: `backend/internal/db/db.go`

- [ ] **Step 1: Add `users` table to `migrate()`**

In `db.go`, find the end of the `migrate()` SQL string (just before the closing backtick on the line that ends `oauth_settings`). Add the `users` table definition:

```go
// Add this block inside the migrate() SQL string, after the oauth_settings table:

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

The full end of the migrate SQL (after your edit) should look like:

```go
CREATE TABLE IF NOT EXISTS oauth_settings (
  id            INTEGER PRIMARY KEY,
  client_id     TEXT NOT NULL DEFAULT '',
  client_secret TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);
`)
	return err
}
```

- [ ] **Step 2: Add `User` struct + helper methods**

At the very end of `backend/internal/db/db.go`, append:

```go
// ── Users (auth) ──────────────────────────────────────────────────────────────

type User struct {
	ID           int64
	Username     string
	PasswordHash string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// GetUser returns the single admin user, or nil if none exists (auth disabled).
func (d *DB) GetUser() (*User, error) {
	row := d.QueryRow(`SELECT id, username, password_hash, created_at, updated_at FROM users LIMIT 1`)
	var u User
	if err := row.Scan(&u.ID, &u.Username, &u.PasswordHash, &u.CreatedAt, &u.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &u, nil
}

// UpsertUser creates or replaces the single admin user (id=1).
func (d *DB) UpsertUser(username, passwordHash string) error {
	_, err := d.Exec(`
INSERT INTO users (id, username, password_hash) VALUES (1, ?, ?)
ON CONFLICT(id) DO UPDATE SET
  username=excluded.username,
  password_hash=excluded.password_hash,
  updated_at=CURRENT_TIMESTAMP`,
		username, passwordHash)
	return err
}

// DeleteUser removes the admin user, disabling login protection.
func (d *DB) DeleteUser() error {
	_, err := d.Exec(`DELETE FROM users`)
	return err
}
```

- [ ] **Step 3: Build to confirm**

```bash
cd /home/sakitha/apps/vps/backend && go build ./...
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/sakitha/apps/vps && git add backend/internal/db/db.go
git commit -m "feat: add users table and DB helpers for login system"
```

---

## Task 3: Add MakeJWT + ValidateToken to auth package

**Files:**
- Modify: `backend/internal/auth/middleware.go`

- [ ] **Step 1: Add two exported methods to `Middleware`**

Append these two methods at the end of `backend/internal/auth/middleware.go`:

```go
// ValidateToken reports whether the given JWT string is valid and unexpired.
func (m *Middleware) ValidateToken(token string) bool {
	return m.validJWT(token)
}

// MakeJWT creates a signed JWT for the given username, expiring in ttlSecs seconds.
func (m *Middleware) MakeJWT(username string, ttlSecs int64) string {
	header := base64.RawURLEncoding.EncodeToString([]byte(`{"alg":"HS256","typ":"JWT"}`))
	exp := time.Now().Unix() + ttlSecs
	payload, _ := json.Marshal(map[string]any{"sub": username, "exp": exp})
	enc := base64.RawURLEncoding.EncodeToString(payload)
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(header + "." + enc))
	sig := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return header + "." + enc + "." + sig
}
```

All imports (`hmac`, `sha256`, `base64`, `json`, `time`) are already present in the file.

- [ ] **Step 2: Build to confirm**

```bash
cd /home/sakitha/apps/vps/backend && go build ./...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /home/sakitha/apps/vps && git add backend/internal/auth/middleware.go
git commit -m "feat: add MakeJWT and ValidateToken to auth middleware"
```

---

## Task 4: Create auth_handler.go

**Files:**
- Create: `backend/internal/api/auth_handler.go`

- [ ] **Step 1: Create the file with all 5 handlers**

```go
package api

import (
	"encoding/json"
	"net/http"

	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "pn_session"
const sessionTTL = int64(1800) // 30 minutes

func setSessionCookie(w http.ResponseWriter, token string, maxAge int) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
}

// GET /api/auth/status
// Returns {enabled, loggedIn, username?}. Extends the session window on each valid call.
func (s *Server) authStatus(w http.ResponseWriter, r *http.Request) {
	user, err := s.db.GetUser()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db error"})
		return
	}
	if user == nil {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": false, "loggedIn": false})
		return
	}
	c, err := r.Cookie(sessionCookieName)
	if err != nil || !s.auth.ValidateToken(c.Value) {
		writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "loggedIn": false})
		return
	}
	// Slide the session: issue a fresh token with a full 30-min window.
	setSessionCookie(w, s.auth.MakeJWT(user.Username, sessionTTL), int(sessionTTL))
	writeJSON(w, http.StatusOK, map[string]any{"enabled": true, "loggedIn": true, "username": user.Username})
}

// POST /api/auth/login
// Body: {"username":"...","password":"..."}
func (s *Server) authLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	user, err := s.db.GetUser()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db error"})
		return
	}
	if user == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "login not configured"})
		return
	}
	if user.Username != body.Username ||
		bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(body.Password)) != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid credentials"})
		return
	}
	setSessionCookie(w, s.auth.MakeJWT(user.Username, sessionTTL), int(sessionTTL))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/auth/logout
func (s *Server) authLogout(w http.ResponseWriter, r *http.Request) {
	setSessionCookie(w, "", -1)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /api/auth/setup — create or update the admin account.
// Body: {"username":"...","password":"...","current_password":"..."} (current_password required if account already exists)
func (s *Server) authSetup(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username        string `json:"username"`
		Password        string `json:"password"`
		CurrentPassword string `json:"current_password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if len(body.Username) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "username is required"})
		return
	}
	if len(body.Password) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 8 characters"})
		return
	}
	existing, err := s.db.GetUser()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db error"})
		return
	}
	if existing != nil {
		if bcrypt.CompareHashAndPassword([]byte(existing.PasswordHash), []byte(body.CurrentPassword)) != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Current password is incorrect"})
			return
		}
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), 12)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to hash password"})
		return
	}
	if err := s.db.UpsertUser(body.Username, string(hash)); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to save user"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// DELETE /api/auth/setup — remove the admin account (disables login protection).
// Body: {"password":"..."} — must confirm current password.
func (s *Server) authSetupDelete(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	existing, err := s.db.GetUser()
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "db error"})
		return
	}
	if existing == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no login configured"})
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(existing.PasswordHash), []byte(body.Password)) != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Incorrect password"})
		return
	}
	if err := s.db.DeleteUser(); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed to remove user"})
		return
	}
	setSessionCookie(w, "", -1)
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
```

- [ ] **Step 2: Build to confirm**

```bash
cd /home/sakitha/apps/vps/backend && go build ./...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /home/sakitha/apps/vps && git add backend/internal/api/auth_handler.go
git commit -m "feat: add auth handlers (login, logout, setup, status)"
```

---

## Task 5: Add requireAuth middleware + wire routes in server.go

**Files:**
- Modify: `backend/internal/api/middleware.go`
- Modify: `backend/internal/api/server.go`

- [ ] **Step 1: Add `requireAuth` to `middleware.go`**

Append at the end of `backend/internal/api/middleware.go`:

```go
// requireAuth replaces s.auth.Require. It checks whether a user account exists in the
// DB (auth enabled) and, if so, validates either the pn_session cookie or a Bearer token.
// When no user exists, all requests pass through (auth disabled).
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, _ := s.db.GetUser()
		if user == nil {
			// No admin account configured — auth is off.
			next.ServeHTTP(w, r)
			return
		}
		// Cookie path (browser sessions).
		if c, err := r.Cookie("pn_session"); err == nil && s.auth.ValidateToken(c.Value) {
			next.ServeHTTP(w, r)
			return
		}
		// Bearer token path (API / scripts).
		if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") &&
			s.auth.ValidateToken(strings.TrimPrefix(h, "Bearer ")) {
			next.ServeHTTP(w, r)
			return
		}
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
	})
}
```

`strings` is already imported in `middleware.go`.

- [ ] **Step 2: Register auth routes + swap middleware in `server.go`**

In `backend/internal/api/server.go`, find the block of root-level route registrations:

```go
r.Get("/api/github/callback", s.githubCallback)
```

Add the 5 auth routes right after it:

```go
r.Get("/api/auth/status", s.authStatus)
r.Post("/api/auth/login", s.authLogin)
r.Post("/api/auth/logout", s.authLogout)
r.Post("/api/auth/setup", s.authSetup)
r.Delete("/api/auth/setup", s.authSetupDelete)
```

Then find:

```go
r.Route("/api", func(r chi.Router) {
    r.Use(s.auth.Require)
```

Change `s.auth.Require` to `s.requireAuth`:

```go
r.Route("/api", func(r chi.Router) {
    r.Use(s.requireAuth)
```

- [ ] **Step 3: Build to confirm**

```bash
cd /home/sakitha/apps/vps/backend && go build ./...
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /home/sakitha/apps/vps && git add backend/internal/api/middleware.go backend/internal/api/server.go
git commit -m "feat: wire auth routes and replace static middleware with requireAuth"
```

---

## Task 6: Create login page

**Files:**
- Create: `app/login/page.tsx`

- [ ] **Step 1: Create the login page**

```tsx
"use client"

import { useState, useEffect, Suspense } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Loader2 } from "lucide-react"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

interface AuthStatus {
  enabled: boolean
  loggedIn: boolean
}

function LoginForm() {
  const router = useRouter()
  const params = useSearchParams()
  const [username,  setUsername]  = useState("")
  const [password,  setPassword]  = useState("")
  const [error,     setError]     = useState("")
  const [loading,   setLoading]   = useState(false)
  const [checking,  setChecking]  = useState(true)

  useEffect(() => {
    fetch(`${GO_API}/api/auth/status`, { cache: "no-store" })
      .then(r => r.json() as Promise<AuthStatus>)
      .then(d => {
        if (!d.enabled || d.loggedIn) {
          router.replace(params.get("next") ?? "/")
        } else {
          setChecking(false)
        }
      })
      .catch(() => setChecking(false))
  }, [router, params])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const res = await fetch(`${GO_API}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      if (!res.ok) {
        const b = await res.json().catch(() => ({})) as { error?: string }
        setError(b.error ?? "Login failed")
        return
      }
      router.replace(params.get("next") ?? "/")
    } catch {
      setError("Could not reach server")
    } finally {
      setLoading(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pulseNode-navy">
        <Loader2 className="animate-spin text-helm-fg3" size={24} />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-pulseNode-navy p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-helm-fg">PulseNode</h1>
          <p className="text-sm text-helm-fg3 mt-1">Sign in to your dashboard</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-xl border border-pulseNode-border/20 bg-pulseNode-navyLight p-6 space-y-4"
        >
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-helm-fg3">
              Username
            </label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg placeholder:text-helm-fg3 focus:outline-none focus:border-pn-cyan/40"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-helm-fg3">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg placeholder:text-helm-fg3 focus:outline-none focus:border-pn-cyan/40"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full flex items-center justify-center gap-2 bg-pn-cyan hover:bg-pn-cyan/90 disabled:opacity-50 text-white rounded-lg py-2 text-sm font-semibold transition-colors"
          >
            {loading && <Loader2 size={14} className="animate-spin" />}
            Sign in
          </button>
        </form>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-pulseNode-navy">
        <Loader2 className="animate-spin text-helm-fg3" size={24} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
```

- [ ] **Step 2: Build to confirm no TS errors**

```bash
cd /home/sakitha/apps/vps && npm run build 2>&1 | tail -15
```

Expected: build succeeds, `/login` appears in route list.

- [ ] **Step 3: Commit**

```bash
cd /home/sakitha/apps/vps && git add app/login/page.tsx
git commit -m "feat: add login page"
```

---

## Task 7: Create Next.js middleware

**Files:**
- Create: `middleware.ts` (project root — same level as `app/`)

- [ ] **Step 1: Create the middleware file**

```typescript
import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Never gate the login page itself.
  if (pathname.startsWith("/login")) {
    return NextResponse.next()
  }

  const sessionCookie = request.cookies.get("pn_session")

  try {
    const res = await fetch(`${GO_API}/api/auth/status`, {
      headers: sessionCookie
        ? { Cookie: `pn_session=${sessionCookie.value}` }
        : {},
      cache: "no-store",
    })

    const data = (await res.json()) as { enabled: boolean; loggedIn: boolean }

    if (!data.enabled) {
      // No login configured — pass through.
      return NextResponse.next()
    }

    if (!data.loggedIn) {
      const loginUrl = new URL("/login", request.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Valid session — pass through and forward any refreshed cookie from Go.
    const response = NextResponse.next()
    const setCookie = res.headers.get("set-cookie")
    if (setCookie) {
      response.headers.set("set-cookie", setCookie)
    }
    return response
  } catch {
    // Go API unreachable (startup, update) — don't block the user.
    return NextResponse.next()
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|login).*)"],
}
```

- [ ] **Step 2: Build to confirm**

```bash
cd /home/sakitha/apps/vps && npm run build 2>&1 | tail -15
```

Expected: build succeeds, no middleware errors.

- [ ] **Step 3: Commit**

```bash
cd /home/sakitha/apps/vps && git add middleware.ts
git commit -m "feat: add Next.js auth middleware (route guard)"
```

---

## Task 8: Add Security section to settings page

**Files:**
- Modify: `app/settings/page.tsx`

- [ ] **Step 1: Add imports**

At the top of `app/settings/page.tsx`, the current import line is:

```typescript
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Settings, Zap } from "lucide-react"
```

Replace it with:

```typescript
import { AlertTriangle, CheckCircle2, Download, LogOut, RefreshCw, Settings, Shield, ShieldOff, Zap } from "lucide-react"
```

- [ ] **Step 2: Add auth state + handlers to `SettingsPage`**

Inside the `SettingsPage` function body, after the existing state declarations, add:

```typescript
interface AuthStatus { enabled: boolean; loggedIn: boolean; username?: string }

const [authStatus,    setAuthStatus]    = useState<AuthStatus | null>(null)
const [secLoading,    setSecLoading]    = useState(false)
const [secError,      setSecError]      = useState("")
const [secSuccess,    setSecSuccess]    = useState("")
// Enable form
const [newUsername,   setNewUsername]   = useState("")
const [newPassword,   setNewPassword]   = useState("")
const [confirmPwd,    setConfirmPwd]    = useState("")
// Change password form
const [curPassword,   setCurPassword]   = useState("")
const [chgPassword,   setChgPassword]   = useState("")
const [chgConfirm,    setChgConfirm]    = useState("")
// Disable confirm
const [disablePwd,    setDisablePwd]    = useState("")
const [showDisable,   setShowDisable]   = useState(false)
```

- [ ] **Step 3: Add `fetchAuthStatus` effect**

After the existing `useEffect(() => { fetchVersion() }, [fetchVersion])` line, add:

```typescript
const fetchAuthStatus = useCallback(async () => {
  try {
    const res = await fetch(`${GO_API}/api/auth/status`, { cache: "no-store" })
    if (res.ok) setAuthStatus(await res.json() as AuthStatus)
  } catch { /* ignore */ }
}, [])

useEffect(() => { fetchAuthStatus() }, [fetchAuthStatus])
```

- [ ] **Step 4: Add auth action handlers**

After `fetchAuthStatus` and its effect, add:

```typescript
async function handleEnableLogin(e: React.FormEvent) {
  e.preventDefault()
  setSecError(""); setSecSuccess(""); setSecLoading(true)
  if (newPassword !== confirmPwd) {
    setSecError("Passwords do not match"); setSecLoading(false); return
  }
  try {
    const res = await fetch(`${GO_API}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: newUsername, password: newPassword }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; setSecError(b.error ?? "Failed"); return }
    setSecSuccess("Login protection enabled!")
    setNewUsername(""); setNewPassword(""); setConfirmPwd("")
    await fetchAuthStatus()
  } catch { setSecError("Request failed") } finally { setSecLoading(false) }
}

async function handleChangePassword(e: React.FormEvent) {
  e.preventDefault()
  setSecError(""); setSecSuccess(""); setSecLoading(true)
  if (chgPassword !== chgConfirm) {
    setSecError("Passwords do not match"); setSecLoading(false); return
  }
  try {
    const res = await fetch(`${GO_API}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: authStatus?.username ?? "", password: chgPassword, current_password: curPassword }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; setSecError(b.error ?? "Failed"); return }
    setSecSuccess("Password updated!")
    setCurPassword(""); setChgPassword(""); setChgConfirm("")
  } catch { setSecError("Request failed") } finally { setSecLoading(false) }
}

async function handleDisableLogin() {
  setSecError(""); setSecLoading(true)
  try {
    const res = await fetch(`${GO_API}/api/auth/setup`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: disablePwd }),
    })
    if (!res.ok) { const b = await res.json().catch(() => ({})) as { error?: string }; setSecError(b.error ?? "Failed"); setSecLoading(false); return }
    setDisablePwd(""); setShowDisable(false)
    await fetchAuthStatus()
  } catch { setSecError("Request failed") } finally { setSecLoading(false) }
}

async function handleLogout() {
  await fetch(`${GO_API}/api/auth/logout`, { method: "POST" }).catch(() => {})
  window.location.href = "/login"
}
```

- [ ] **Step 5: Add Security card JSX**

Inside the `return (...)` of `SettingsPage`, after the closing `</div>` of the update-progress card (the last `{!updating && (...)}` block), and before the final `</div>` that closes the whole page, add:

```tsx
{/* Security */}
<div className="rounded-xl border border-pulseNode-border/20 bg-pulseNode-navyLight overflow-hidden">
  <div className="flex items-center gap-2 px-4 py-3 border-b border-pulseNode-border/10 bg-pulseNode-navy">
    <Shield size={14} className="text-pn-electric" />
    <span className="text-sm font-semibold text-helm-fg">Security</span>
    {authStatus?.enabled && (
      <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
        Protected · {authStatus.username}
      </span>
    )}
    {authStatus && !authStatus.enabled && (
      <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold text-helm-fg3">
        <span className="w-1.5 h-1.5 rounded-full bg-helm-fg3 inline-block" />
        Off
      </span>
    )}
  </div>

  <div className="p-4 space-y-5">
    {/* Status messages */}
    {secError && (
      <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">{secError}</div>
    )}
    {secSuccess && (
      <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-400">{secSuccess}</div>
    )}

    {/* No login configured — show enable form */}
    {authStatus && !authStatus.enabled && (
      <form onSubmit={handleEnableLogin} className="space-y-3">
        <p className="text-xs text-helm-fg3">
          Login protection is <strong className="text-helm-fg">off</strong>. Anyone who can reach this URL can access the dashboard.
          Set a username and password to lock it down.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-helm-fg3 font-semibold">Username</label>
            <input
              value={newUsername} onChange={e => setNewUsername(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg focus:outline-none focus:border-pn-cyan/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-helm-fg3 font-semibold">Password</label>
            <input
              type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg focus:outline-none focus:border-pn-cyan/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-helm-fg3 font-semibold">Confirm password</label>
            <input
              type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg focus:outline-none focus:border-pn-cyan/40"
            />
          </div>
        </div>
        <button
          type="submit" disabled={secLoading || !newUsername || !newPassword || !confirmPwd}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
        >
          <Shield size={12} />
          {secLoading ? "Enabling…" : "Enable login protection"}
        </button>
      </form>
    )}

    {/* Login configured — show change password + disable */}
    {authStatus?.enabled && (
      <div className="space-y-5">
        {/* Change password */}
        <form onSubmit={handleChangePassword} className="space-y-3">
          <p className="text-[10px] uppercase tracking-wider text-helm-fg3 font-semibold">Change password</p>
          <div className="space-y-1">
            <label className="text-[10px] text-helm-fg3">Current password</label>
            <input
              type="password" value={curPassword} onChange={e => setCurPassword(e.target.value)} required
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg focus:outline-none focus:border-pn-cyan/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-helm-fg3">New password</label>
            <input
              type="password" value={chgPassword} onChange={e => setChgPassword(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg focus:outline-none focus:border-pn-cyan/40"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] text-helm-fg3">Confirm new password</label>
            <input
              type="password" value={chgConfirm} onChange={e => setChgConfirm(e.target.value)} required minLength={8}
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-pulseNode-border/20 text-helm-fg focus:outline-none focus:border-pn-cyan/40"
            />
          </div>
          <button
            type="submit" disabled={secLoading || !curPassword || !chgPassword || !chgConfirm}
            className="px-4 py-1.5 rounded-lg border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg disabled:opacity-50 text-xs transition-colors"
          >
            {secLoading ? "Updating…" : "Update password"}
          </button>
        </form>

        {/* Divider */}
        <div className="border-t border-pulseNode-border/10" />

        {/* Logout + Disable */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg text-xs transition-colors"
          >
            <LogOut size={12} />
            Sign out
          </button>
          {!showDisable && (
            <button
              onClick={() => { setShowDisable(true); setSecError(""); setSecSuccess("") }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/20 text-red-400/60 hover:text-red-400 text-xs transition-colors"
            >
              <ShieldOff size={12} />
              Disable login protection
            </button>
          )}
        </div>

        {/* Disable confirm inline */}
        {showDisable && (
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4 space-y-3">
            <p className="text-xs text-red-400">
              This will remove login protection. Anyone with the URL can access the dashboard. Confirm your password to proceed.
            </p>
            <input
              type="password" placeholder="Current password" value={disablePwd}
              onChange={e => setDisablePwd(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm bg-pulseNode-navy border border-red-500/20 text-helm-fg focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { setShowDisable(false); setDisablePwd("") }}
                className="px-3 py-1.5 rounded-lg border border-pulseNode-border/20 text-helm-fg3 text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDisableLogin}
                disabled={secLoading || !disablePwd}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
              >
                <ShieldOff size={12} />
                {secLoading ? "Disabling…" : "Confirm disable"}
              </button>
            </div>
          </div>
        )}
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 6: Build to confirm**

```bash
cd /home/sakitha/apps/vps && npm run build 2>&1 | tail -15
```

Expected: clean build, `/settings` and `/login` both appear in route list.

- [ ] **Step 7: Commit**

```bash
cd /home/sakitha/apps/vps && git add app/settings/page.tsx
git commit -m "feat: add Security section to settings page"
```

---

## Task 9: Final push

- [ ] **Step 1: Full build check**

```bash
cd /home/sakitha/apps/vps/backend && go build ./...
cd /home/sakitha/apps/vps && npm run build 2>&1 | tail -5
```

Expected: both succeed with no errors.

- [ ] **Step 2: Push to GitHub**

```bash
cd /home/sakitha/apps/vps && git push origin main
```
