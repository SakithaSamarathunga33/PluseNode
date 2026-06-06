"use client"

import { useState, useEffect, useCallback } from "react"
import { Key, Unlink, RefreshCw, ExternalLink, ChevronRight, Shield, Webhook, Copy, Check, Eye, EyeOff, Puzzle, Trash2, Building2, User as UserIcon } from "lucide-react"
import { GitHubDark } from "developer-icons"
import Link from "next/link"
import { copyText } from "@/lib/utils"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

type Account = { login: string; avatarUrl: string; tokenType: "oauth" | "pat" }
type OAuthSettings = { clientId: string; hasSecret: boolean; configured: boolean }
type AppSettings = { configured: boolean; appId: string; slug: string; hasKey: boolean }
type AppInstallation = { id: number; installationId: number; accountLogin: string; accountType: string; createdAt: string }

export default function GitHubPage() {
  const [account, setAccount]             = useState<Account | null>(null)
  const [oauthSettings, setOAuthSettings] = useState<OAuthSettings | null>(null)
  const [loading, setLoading]             = useState(true)

  const [patValue, setPatValue]           = useState("")
  const [patLoading, setPatLoading]       = useState(false)
  const [patError, setPatError]           = useState("")

  const [clientId, setClientId]           = useState("")
  const [clientSecret, setClientSecret]   = useState("")
  const [oauthSaving, setOauthSaving]     = useState(false)
  const [oauthSaved, setOauthSaved]       = useState(false)

  const [webhookSecret, setWebhookSecret] = useState("")
  const [showSecret, setShowSecret]       = useState(false)
  const [copied, setCopied]               = useState<string | null>(null)

  // GitHub App state
  const [appSettings, setAppSettings]           = useState<AppSettings | null>(null)
  const [appInstallations, setAppInstallations] = useState<AppInstallation[]>([])
  const [appId, setAppId]                       = useState("")
  const [appSlug, setAppSlug]                   = useState("")
  const [appPrivateKey, setAppPrivateKey]       = useState("")
  const [appWebhookSecret, setAppWebhookSecret] = useState("")
  const [appSaving, setAppSaving]               = useState(false)
  const [appSaved, setAppSaved]                 = useState(false)
  const [appSaveError, setAppSaveError]         = useState("")
  const [appBanner, setAppBanner]               = useState<string | null>(null)

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

  const fetchWebhook = useCallback(async () => {
    try {
      const r = await fetch(`${GO_API}/api/github/webhook-info`)
      const d = await r.json()
      setWebhookSecret(d.secret ?? "")
    } catch { /* ignore */ }
  }, [])

  const fetchAppSettings = useCallback(async () => {
    try {
      const r = await fetch(`${GO_API}/api/github/app/settings`)
      const d: AppSettings = await r.json()
      setAppSettings(d)
      setAppId(d.appId ?? "")
      setAppSlug(d.slug ?? "")
    } catch { setAppSettings(null) }
  }, [])

  const fetchAppInstallations = useCallback(async () => {
    try {
      const r = await fetch(`${GO_API}/api/github/app/installations`)
      setAppInstallations((await r.json()) ?? [])
    } catch { setAppInstallations([]) }
  }, [])

  useEffect(() => {
    Promise.all([
      fetchAccount(), fetchOAuthSettings(), fetchWebhook(),
      fetchAppSettings(), fetchAppInstallations(),
    ]).finally(() => setLoading(false))

    const params = new URLSearchParams(window.location.search)
    if (params.get("connected") === "1") window.history.replaceState({}, "", "/github")
    if (params.get("app_installed") === "1") {
      setAppBanner("installed")
      fetchAppInstallations()
      window.history.replaceState({}, "", "/github")
    }
    if (params.get("app_uninstalled") === "1") {
      setAppBanner("uninstalled")
      fetchAppInstallations()
      window.history.replaceState({}, "", "/github")
    }
    if (params.get("app_error")) {
      setAppBanner("error:" + params.get("app_error"))
      window.history.replaceState({}, "", "/github")
    }
  }, [fetchAccount, fetchOAuthSettings, fetchWebhook, fetchAppSettings, fetchAppInstallations])

  const copy = async (value: string, key: string) => {
    if (await copyText(value)) {
      setCopied(key)
      setTimeout(() => setCopied(c => (c === key ? null : c)), 1600)
    }
  }
  const webhookUrl = typeof window !== "undefined" ? `${window.location.origin}${GO_API}/api/github/webhook` : ""
  const appCallbackURL = typeof window !== "undefined" ? `${window.location.origin}/github/app/callback` : ""

  const saveAppSettings = async () => {
    setAppSaving(true); setAppSaveError("")
    try {
      const r = await fetch(`${GO_API}/api/github/app/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, slug: appSlug, privateKey: appPrivateKey, webhookSecret: appWebhookSecret }),
      })
      const d = await r.json()
      if (!r.ok) { setAppSaveError(d.error ?? "Failed"); return }
      setAppPrivateKey(""); setAppWebhookSecret("")
      setAppSaved(true)
      await fetchAppSettings()
      setTimeout(() => setAppSaved(false), 3000)
    } catch { setAppSaveError("Network error") }
    finally { setAppSaving(false) }
  }

  const installApp = async () => {
    const r = await fetch(`${GO_API}/api/github/app/install-url`)
    const d = await r.json()
    if (d.url) {
      // Encode the current instance's origin so the callback page can relay
      // back here when the GitHub App's Setup URL points to a different instance.
      const state = btoa(window.location.origin)
      window.location.href = `${d.url}?state=${encodeURIComponent(state)}`
    }
  }

  const removeInstallation = async (id: number) => {
    await fetch(`${GO_API}/api/github/app/installations/${id}`, { method: "DELETE" })
    await fetchAppInstallations()
  }

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
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>GitHub</h1>
        <p className="text-sm mt-1" style={{ color: "var(--fg-3)" }}>
          Connect your GitHub account to deploy projects from private and public repositories.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_420px] items-start">
        {/* Left — Account connection */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--fg-3)" }}>
            Account
          </h2>

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
              {oauthSettings?.configured && (
                <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-2">
                    <GitHubDark size={16} className="theme-dark-surface-icon" />
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
                    <GitHubDark size={15} />
                    Continue with GitHub
                  </button>
                </div>
              )}

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

        {/* Right — OAuth App Settings */}
        <div className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--fg-3)" }}>
            OAuth App Settings
          </h2>

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

          <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-medium" style={{ color: "var(--fg-3)" }}>How OAuth works</p>
            <ul className="text-xs space-y-1" style={{ color: "var(--fg-3)" }}>
              <li>1. Save your Client ID &amp; Secret above</li>
              <li>2. Click &quot;Connect with GitHub OAuth&quot; on the left</li>
              <li>3. Authorize PulseNode in the GitHub popup</li>
              <li>4. You&apos;re redirected back and connected</li>
            </ul>
          </div>
        </div>
      </div>

      {/* GitHub App */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--fg-3)" }}>
            GitHub App <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium normal-case tracking-normal"
              style={{ background: "color-mix(in srgb, var(--acc) 15%, transparent)", color: "var(--acc)" }}>Recommended</span>
          </h2>
        </div>

        {appBanner && (
          <div className="rounded-xl px-4 py-3 text-sm flex items-center gap-2"
            style={{
              background: appBanner === "installed" ? "color-mix(in srgb, var(--ok) 12%, transparent)"
                        : appBanner === "uninstalled" ? "color-mix(in srgb, var(--warn) 12%, transparent)"
                        : "color-mix(in srgb, var(--err) 12%, transparent)",
              border: `1px solid ${appBanner === "installed" ? "color-mix(in srgb, var(--ok) 25%, transparent)"
                        : appBanner === "uninstalled" ? "color-mix(in srgb, var(--warn) 25%, transparent)"
                        : "color-mix(in srgb, var(--err) 25%, transparent)"}`,
              color: appBanner === "installed" ? "var(--ok)" : appBanner === "uninstalled" ? "var(--warn)" : "var(--err)",
            }}>
            {appBanner === "installed" ? "✓ GitHub App installed successfully." : appBanner === "uninstalled" ? "App uninstalled." : `Install error: ${appBanner.replace("error:", "")}`}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_420px] items-start">
          {/* Left — installations */}
          <div className="space-y-4">
            <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <Puzzle size={16} style={{ color: "var(--fg)" }} />
                <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>Installations</p>
                {appSettings?.slug && appInstallations.length > 0 && (
                  <button onClick={installApp}
                    className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "var(--acc)", color: "#fff" }}>
                    <ExternalLink size={11} /> Install on more repos
                  </button>
                )}
              </div>

              {!appSettings?.slug ? (
                <p className="text-xs" style={{ color: "var(--fg-3)" }}>
                  Configure your GitHub App on the right, then click <strong>Install App</strong> to grant access to repos.
                  Once installed, PulseNode receives push webhooks automatically for every repo — no per-repo hook setup needed.
                </p>
              ) : appInstallations.length === 0 ? (
                <div className="space-y-3">
                  <p className="text-xs" style={{ color: "var(--fg-3)" }}>
                    No installations yet. Click <strong>Install App</strong> to pick which accounts/repos to grant access to.
                  </p>
                  <button onClick={installApp}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium"
                    style={{ background: "var(--fg)", color: "var(--bg-1)" }}>
                    <GitHubDark size={15} /> Install GitHub App
                  </button>
                </div>
              ) : (
                <ul className="space-y-2">
                  {appInstallations.map(inst => (
                    <li key={inst.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
                      style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}>
                      {inst.accountType === "Organization"
                        ? <Building2 size={14} style={{ color: "var(--fg-3)" }} />
                        : <UserIcon size={14} style={{ color: "var(--fg-3)" }} />}
                      <span className="text-sm font-medium flex-1" style={{ color: "var(--fg)" }}>
                        {inst.accountLogin === "unknown" ? "Connected" : inst.accountLogin}
                      </span>
                      {inst.accountLogin !== "unknown" && (
                        <span className="text-xs" style={{ color: "var(--fg-3)" }}>{inst.accountType}</span>
                      )}
                      <button onClick={() => removeInstallation(inst.id)} title="Remove" style={{ color: "var(--fg-3)" }}
                        className="hover:opacity-70 transition-opacity">
                        <Trash2 size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Right — App config */}
          <div className="space-y-4">
            <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="flex items-center gap-2">
                <Shield size={16} style={{ color: "var(--fg)" }} />
                <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>GitHub App Settings</p>
                {appSettings?.slug && (
                  <span className="ml-auto flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                    style={{
                      background: appSettings.configured
                        ? "color-mix(in srgb, var(--ok) 15%, transparent)"
                        : "color-mix(in srgb, var(--warn) 15%, transparent)",
                      color: appSettings.configured ? "var(--ok)" : "var(--warn)",
                    }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: appSettings.configured ? "var(--ok)" : "var(--warn)" }} />
                    {appSettings.configured ? "Configured" : "Partial — key missing"}
                  </span>
                )}
              </div>
              <p className="text-xs" style={{ color: "var(--fg-3)" }}>
                Create a GitHub App at{" "}
                <a href="https://github.com/settings/apps/new" target="_blank" rel="noopener noreferrer"
                  className="underline" style={{ color: "var(--acc)" }}>
                  github.com/settings/apps/new <ExternalLink size={10} className="inline" />
                </a>.
                Set <strong>Setup URL</strong> to{" "}
                <code className="text-xs px-1 rounded" style={{ background: "var(--bg-3)" }}>{appCallbackURL}</code>{" "}
                and the <strong>Webhook URL</strong> to{" "}
                <code className="text-xs px-1 rounded" style={{ background: "var(--bg-3)" }}>{webhookUrl}</code>.
                Permissions needed: <em>Contents</em> (read), <em>Metadata</em> (read), <em>Webhooks</em> (read/write). Subscribe to: <em>Push</em>.
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>App ID</label>
                  <input type="text" placeholder="123456" value={appId} onChange={e => setAppId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }} />
                </div>
                <div>
                  <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>App Slug (from app URL)</label>
                  <input type="text" placeholder="my-pulsenode-app" value={appSlug} onChange={e => setAppSlug(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }} />
                </div>
                <div>
                  <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>
                    Private Key (PEM){appSettings?.hasKey && <span className="ml-2" style={{ color: "var(--ok)" }}>(already set)</span>}
                  </label>
                  <textarea rows={3} placeholder={appSettings?.hasKey ? "Leave blank to keep existing" : "-----BEGIN RSA PRIVATE KEY-----\n..."}
                    value={appPrivateKey} onChange={e => setAppPrivateKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-xs font-mono outline-none resize-none"
                    style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }} />
                </div>
                <div>
                  <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>
                    Webhook Secret{appSettings?.configured && <span className="ml-2" style={{ color: "var(--ok)" }}>(already set)</span>}
                  </label>
                  <input type="password" placeholder={appSettings?.configured ? "Leave blank to keep existing" : "Your app's webhook secret"}
                    value={appWebhookSecret} onChange={e => setAppWebhookSecret(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }} />
                </div>
              </div>
              {appSaveError && <p className="text-xs" style={{ color: "var(--err)" }}>{appSaveError}</p>}
              <button onClick={saveAppSettings} disabled={appSaving || (!appId || !appSlug)}
                className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                style={{ background: "var(--acc)", color: "#fff" }}>
                {appSaved ? "Saved!" : appSaving ? "Saving…" : "Save App Settings"}
              </button>
            </div>

            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--fg-3)" }}>Why GitHub App?</p>
              <ul className="text-xs space-y-1" style={{ color: "var(--fg-3)" }}>
                <li>• Install once → all repos in the account covered</li>
                <li>• No per-repo admin rights needed to receive webhooks</li>
                <li>• Higher API rate limits (installation tokens)</li>
                <li>• Works on org repos without a personal token</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Webhooks — instant auto-deploy on push */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--fg-3)" }}>
          Deploy Webhook (Legacy / Manual)
        </h2>
        <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">
            <Webhook size={16} style={{ color: "var(--fg)" }} />
            <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>Instant deploys on push</p>
          </div>
          <p className="text-xs" style={{ color: "var(--fg-3)" }}>
            PulseNode <span style={{ color: "var(--fg)" }}>installs this webhook automatically</span> on a repo when you
            create a project from it. Use the details below only to add it by hand (e.g. if the token lacked admin rights)
            — <span className="font-mono">Settings → Webhooks → Add webhook</span>.
          </p>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>Payload URL</label>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}>
                <code className="flex-1 text-xs font-mono truncate" style={{ color: "var(--fg)" }}>{webhookUrl}</code>
                <button onClick={() => copy(webhookUrl, "url")} title="Copy" className="flex-shrink-0" style={{ color: "var(--fg-3)" }}>
                  {copied === "url" ? <Check size={13} style={{ color: "var(--ok)" }} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>Secret</label>
              <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}>
                <code className="flex-1 text-xs font-mono truncate" style={{ color: "var(--fg)" }}>
                  {webhookSecret ? (showSecret ? webhookSecret : "•".repeat(24)) : "—"}
                </code>
                <button onClick={() => setShowSecret(s => !s)} title={showSecret ? "Hide" : "Reveal"} className="flex-shrink-0" style={{ color: "var(--fg-3)" }}>
                  {showSecret ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
                <button onClick={() => copy(webhookSecret, "secret")} title="Copy" className="flex-shrink-0" style={{ color: "var(--fg-3)" }}>
                  {copied === "secret" ? <Check size={13} style={{ color: "var(--ok)" }} /> : <Copy size={13} />}
                </button>
              </div>
            </div>
          </div>

          <ul className="text-xs space-y-1" style={{ color: "var(--fg-3)" }}>
            <li>• Content type: <code className="px-1 rounded" style={{ background: "var(--bg-3)" }}>application/json</code></li>
            <li>• Events: <span style={{ color: "var(--fg)" }}>Just the push event</span></li>
            <li>• The poller stays on as a fallback, so webhooks are optional but faster.</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
