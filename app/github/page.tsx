"use client"

import { useState, useEffect, useCallback } from "react"
import { GitFork, Key, Unlink, RefreshCw, ExternalLink, ChevronRight, Shield } from "lucide-react"
import Link from "next/link"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

type Account = { login: string; avatarUrl: string; tokenType: "oauth" | "pat" }
type OAuthSettings = { clientId: string; hasSecret: boolean; configured: boolean }

export default function GitHubPage() {
  const [account, setAccount]           = useState<Account | null>(null)
  const [oauthSettings, setOAuthSettings] = useState<OAuthSettings | null>(null)
  const [loading, setLoading]           = useState(true)
  const [tab, setTab]                   = useState<"connect" | "oauth-settings">("connect")

  // Connect tab state
  const [patValue, setPatValue]         = useState("")
  const [patLoading, setPatLoading]     = useState(false)
  const [patError, setPatError]         = useState("")

  // OAuth settings tab state
  const [clientId, setClientId]         = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [oauthSaving, setOauthSaving]   = useState(false)
  const [oauthSaved, setOauthSaved]     = useState(false)

  const fetchAccount = useCallback(async () => {
    try {
      const r = await fetch(`${GO_API}/api/github/account`)
      setAccount((await r.json()) ?? null)
    } catch { setAccount(null) }
  }, [])

  const fetchOAuthSettings = useCallback(async () => {
    try {
      const r = await fetch(`${GO_API}/api/github/oauth-settings`)
      const d: OAuthSettings = await r.json()
      setOAuthSettings(d)
      setClientId(d.clientId ?? "")
    } catch { setOAuthSettings(null) }
  }, [])

  useEffect(() => {
    Promise.all([fetchAccount(), fetchOAuthSettings()]).finally(() => setLoading(false))
    const params = new URLSearchParams(window.location.search)
    if (params.get("connected") === "1") window.history.replaceState({}, "", "/github")
  }, [fetchAccount, fetchOAuthSettings])

  const connectOAuth = async () => {
    const r = await fetch(`${GO_API}/api/github/auth-url`)
    window.location.href = (await r.json()).url
  }

  const connectPAT = async () => {
    if (!patValue.trim()) return
    setPatLoading(true); setPatError("")
    try {
      const r = await fetch(`${GO_API}/api/github/pat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: patValue }),
      })
      const d = await r.json()
      if (!r.ok) { setPatError(d.error ?? "Failed"); return }
      setPatValue("")
      await fetchAccount()
    } catch { setPatError("Network error") }
    finally { setPatLoading(false) }
  }

  const disconnect = async () => {
    await fetch(`${GO_API}/api/github/account`, { method: "DELETE" })
    setAccount(null)
  }

  const saveOAuthSettings = async () => {
    setOauthSaving(true)
    try {
      await fetch(`${GO_API}/api/github/oauth-settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, clientSecret }),
      })
      setClientSecret("")
      setOauthSaved(true)
      await fetchOAuthSettings()
      setTimeout(() => setOauthSaved(false), 3000)
    } finally { setOauthSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--fg-3)" }} />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>GitHub</h1>
        <p className="text-sm mt-1" style={{ color: "var(--fg-3)" }}>
          Connect your GitHub account to deploy projects from private and public repositories.
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--bg-2)" }}>
        {(["connect", "oauth-settings"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="flex-1 py-1.5 text-xs font-medium rounded-md transition-colors"
            style={{
              background: tab === t ? "var(--bg-3)" : "transparent",
              color: tab === t ? "var(--fg)" : "var(--fg-3)",
            }}
          >
            {t === "connect" ? "Connect Account" : "OAuth App Settings"}
          </button>
        ))}
      </div>

      {/* Connect tab */}
      {tab === "connect" && (
        <div className="space-y-4">
          {account ? (
            <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={account.avatarUrl} alt={account.login} className="w-10 h-10 rounded-full" />
                <div>
                  <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>{account.login}</p>
                  <p className="text-xs" style={{ color: "var(--fg-3)" }}>
                    Connected via {account.tokenType === "pat" ? "Personal Access Token" : "GitHub OAuth"}
                  </p>
                </div>
                <span className="ml-auto flex items-center gap-1.5 text-xs px-2 py-1 rounded-full"
                  style={{ background: "color-mix(in srgb, var(--ok) 15%, transparent)", color: "var(--ok)" }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--ok)" }} />
                  Connected
                </span>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/projects/new"
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium"
                  style={{ background: "var(--acc)", color: "#fff" }}
                >
                  <span>Deploy a project</span>
                  <ChevronRight size={14} />
                </Link>
                <button
                  onClick={disconnect}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm"
                  style={{ background: "var(--bg-3)", color: "var(--fg-3)", border: "1px solid var(--border)" }}
                >
                  <Unlink size={14} />
                  Disconnect
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* OAuth button — only if credentials are configured */}
              {oauthSettings?.configured && (
                <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <GitFork size={16} style={{ color: "var(--fg)" }} />
                    <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>Connect with GitHub OAuth</p>
                  </div>
                  <p className="text-xs" style={{ color: "var(--fg-3)" }}>
                    Authorize PulseNode to access your GitHub repositories.
                  </p>
                  <button
                    onClick={connectOAuth}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium"
                    style={{ background: "var(--fg)", color: "var(--bg-1)" }}
                  >
                    <GitFork size={15} />
                    Continue with GitHub
                  </button>
                </div>
              )}

              {/* PAT */}
              <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                <div className="flex items-center gap-2">
                  <Key size={16} style={{ color: "var(--fg)" }} />
                  <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>Personal Access Token</p>
                </div>
                <p className="text-xs" style={{ color: "var(--fg-3)" }}>
                  Create a token at{" "}
                  <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer"
                    className="underline" style={{ color: "var(--acc)" }}>
                    github.com/settings/tokens <ExternalLink size={10} className="inline" />
                  </a>{" "}
                  with <code className="text-xs px-1 py-0.5 rounded" style={{ background: "var(--bg-3)" }}>repo</code> scope.
                </p>
                <input
                  type="password"
                  placeholder="ghp_xxxxxxxxxxxx"
                  value={patValue}
                  onChange={e => setPatValue(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && connectPAT()}
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
                />
                {patError && <p className="text-xs" style={{ color: "var(--err)" }}>{patError}</p>}
                <button
                  onClick={connectPAT}
                  disabled={patLoading || !patValue.trim()}
                  className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  style={{ background: "var(--acc)", color: "#fff" }}
                >
                  {patLoading ? "Validating…" : "Connect"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* OAuth App Settings tab */}
      {tab === "oauth-settings" && (
        <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <Shield size={16} style={{ color: "var(--fg)" }} />
            <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>GitHub OAuth App</p>
          </div>
          <p className="text-xs" style={{ color: "var(--fg-3)" }}>
            Create an OAuth App at{" "}
            <a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer"
              className="underline" style={{ color: "var(--acc)" }}>
              github.com/settings/developers
            </a>.
            {" "}Set the callback URL to{" "}
            <code className="text-xs px-1 rounded" style={{ background: "var(--bg-3)" }}>
              {typeof window !== "undefined" ? window.location.origin : ""}/go/api/github/callback
            </code>
          </p>
          <div className="space-y-3">
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>Client ID</label>
              <input
                type="text"
                placeholder="Iv1.xxxxxxxxxxxx"
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
              />
            </div>
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>
                Client Secret{oauthSettings?.hasSecret && <span className="ml-2" style={{ color: "var(--ok)" }}>(already set)</span>}
              </label>
              <input
                type="password"
                placeholder={oauthSettings?.hasSecret ? "Leave blank to keep existing" : "xxxxxxxxxxxxxxxxxxxx"}
                value={clientSecret}
                onChange={e => setClientSecret(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
              />
            </div>
          </div>
          <button
            onClick={saveOAuthSettings}
            disabled={oauthSaving}
            className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            {oauthSaved ? "Saved!" : oauthSaving ? "Saving…" : "Save OAuth Settings"}
          </button>
        </div>
      )}
    </div>
  )
}
