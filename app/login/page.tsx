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
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error,    setError]    = useState("")
  const [loading,  setLoading]  = useState(false)
  const [checking, setChecking] = useState(true)

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
      // Hard navigation so middleware re-runs server-side with the freshly-set
      // session cookie. A client-side router.replace can race the new cookie and
      // bounce straight back to /login.
      window.location.href = params.get("next") ?? "/"
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
    <div
      className="min-h-screen flex items-center justify-center bg-pulseNode-navy p-4 relative"
      style={{
        backgroundImage: "url('/file_0000000053ac720b95e22d8410d1da4d.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      <div className="absolute inset-0 pointer-events-none" style={{ background: "rgba(8,8,11,0.55)" }} />
      <div className="w-full max-w-sm relative z-10">
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
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-[var(--acc)] hover:bg-[var(--acc-2)] disabled:opacity-60 text-white rounded-lg py-2.5 text-sm font-semibold shadow-[0_1px_0_rgba(255,255,255,0.16)_inset,0_10px_24px_-14px_rgba(139,124,255,0.9)] transition-colors"
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
