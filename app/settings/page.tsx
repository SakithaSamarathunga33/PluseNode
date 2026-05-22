"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, Download, RefreshCw, Settings, Zap } from "lucide-react"

interface VersionInfo {
  current: string
  latest: string | null
  hasUpdate: boolean
  releaseUrl: string | null
  changelog: string | null
}

interface UpdateStatus {
  running: boolean
  log: string[]
  error: string | null
  startedAt: string | null
}

function LogLine({ line }: { line: string }) {
  const isPhase = line.startsWith("::")
  if (isPhase) {
    const msg = line.replace(/^::[^:]+:: /, "")
    return <p className="text-xs text-pn-electric font-medium">{msg}</p>
  }
  if (line.startsWith("⚠")) return <p className="text-xs text-amber-400">{line}</p>
  if (line.startsWith("✕")) return <p className="text-xs text-red-400">{line}</p>
  return <p className="text-xs text-helm-fg3 font-mono">{line}</p>
}

export default function SettingsPage() {
  const [version,   setVersion]   = useState<VersionInfo | null>(null)
  const [status,    setStatus]    = useState<UpdateStatus | null>(null)
  const [checking,  setChecking]  = useState(false)
  const [updating,  setUpdating]  = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [reconnecting, setReconnecting] = useState(false)

  const fetchVersion = useCallback(async () => {
    setChecking(true)
    try {
      const res = await fetch("/api/system/version")
      if (res.ok) setVersion(await res.json())
    } catch { /* ignore */ }
    finally { setChecking(false) }
  }, [])

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/system/update/status")
      if (res.ok) setStatus(await res.json())
    } catch { /* node-api temporarily offline during update */ }
  }, [])

  useEffect(() => { fetchVersion() }, [fetchVersion])

  // Poll status while updating
  useEffect(() => {
    if (!updating) return
    const timer = setInterval(fetchStatus, 1500)
    return () => clearInterval(timer)
  }, [updating, fetchStatus])

  // Countdown + reconnect after update starts
  useEffect(() => {
    if (!updating) return
    setCountdown(90)
    const tick = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          clearInterval(tick)
          setReconnecting(true)
          return 0
        }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(tick)
  }, [updating])

  // Auto-reconnect: reload page when node-api comes back
  useEffect(() => {
    if (!reconnecting) return
    const tryReconnect = async () => {
      try {
        const res = await fetch("/api/health")
        if (res.ok) { window.location.reload(); return }
      } catch { /* still offline */ }
      setTimeout(tryReconnect, 3000)
    }
    setTimeout(tryReconnect, 3000)
  }, [reconnecting])

  async function handleUpdate() {
    setUpdating(true)
    setStatus({ running: true, log: ["Sending update command..."], error: null, startedAt: new Date().toISOString() })
    try {
      const res = await fetch("/api/system/update", { method: "POST" })
      if (!res.ok) {
        const b = await res.json().catch(() => ({}))
        setStatus(s => ({ ...s!, error: b.error || "Failed to start update", running: false }))
        setUpdating(false)
      }
    } catch {
      // Node-api going down is expected during update — treat as success
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings size={22} className="text-helm-fg3" />
        <div>
          <h1 className="text-xl font-semibold text-helm-fg">Settings</h1>
          <p className="text-sm text-helm-fg3 mt-0.5">System configuration and updates</p>
        </div>
      </div>

      {/* Version card */}
      <div className="rounded-xl border border-pulseNode-border/20 bg-pulseNode-navyLight overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-pulseNode-border/10 bg-pulseNode-navy">
          <Zap size={14} className="text-pn-electric" />
          <span className="text-sm font-semibold text-helm-fg">Version</span>
        </div>

        <div className="p-4 space-y-4">
          {/* Current / latest */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-pulseNode-navy p-3">
              <div className="text-[10px] uppercase tracking-wider text-helm-fg3 mb-1">Installed</div>
              <code className="text-sm font-mono text-helm-fg">
                {version ? `v${version.current}` : "—"}
              </code>
            </div>
            <div className="rounded-lg bg-pulseNode-navy p-3">
              <div className="text-[10px] uppercase tracking-wider text-helm-fg3 mb-1">Latest release</div>
              <code className="text-sm font-mono text-helm-fg">
                {version?.latest ? `v${version.latest}` : checking ? "checking…" : "—"}
              </code>
            </div>
          </div>

          {/* Status badge */}
          {version && !updating && (
            <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${
              version.hasUpdate
                ? "bg-amber-500/10 border border-amber-500/20 text-amber-400"
                : "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
            }`}>
              {version.hasUpdate
                ? <><AlertTriangle size={13} /> Update available — v{version.latest}</>
                : <><CheckCircle2 size={13} /> You are on the latest version</>
              }
            </div>
          )}

          {/* Changelog */}
          {version?.hasUpdate && version.changelog && (
            <div className="rounded-lg bg-pulseNode-navy p-3 space-y-1">
              <div className="text-[10px] uppercase tracking-wider text-helm-fg3 mb-2">What&apos;s new</div>
              <pre className="text-[11px] text-helm-fg3 whitespace-pre-wrap font-sans leading-relaxed max-h-40 overflow-y-auto">
                {version.changelog}
              </pre>
              {version.releaseUrl && (
                <a
                  href={version.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-pn-electric hover:underline"
                >
                  View full release notes →
                </a>
              )}
            </div>
          )}

          {/* Actions */}
          {!updating && (
            <div className="flex gap-2">
              <button
                onClick={fetchVersion}
                disabled={checking}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg text-xs transition-colors disabled:opacity-50"
              >
                <RefreshCw size={12} className={checking ? "animate-spin" : ""} />
                {checking ? "Checking…" : "Check for updates"}
              </button>

              {version?.hasUpdate && (
                <button
                  onClick={handleUpdate}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
                >
                  <Download size={12} />
                  Update to v{version.latest}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Update progress */}
      {updating && (
        <div className="rounded-xl border border-pulseNode-border/20 bg-pulseNode-navyLight overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-pulseNode-border/10 bg-pulseNode-navy">
            <RefreshCw size={14} className="text-pn-electric animate-spin" />
            <span className="text-sm font-semibold text-helm-fg">
              {reconnecting ? "Reconnecting…" : "Updating PulseNode"}
            </span>
            {!reconnecting && countdown > 0 && (
              <span className="ml-auto text-xs text-helm-fg3">
                Restart expected in ~{countdown}s
              </span>
            )}
          </div>

          <div className="p-4 space-y-3">
            {/* Log */}
            {status && status.log.length > 0 && (
              <div className="rounded-lg bg-pulseNode-navy p-3 space-y-1 max-h-48 overflow-y-auto">
                {status.log.map((l, i) => <LogLine key={i} line={l} />)}
              </div>
            )}

            {status?.error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-400">
                {status.error}
              </div>
            )}

            {reconnecting && (
              <p className="text-xs text-helm-fg3">
                Waiting for the dashboard to come back online… This may take up to 2 minutes while Docker rebuilds images.
              </p>
            )}

            {!reconnecting && !status?.error && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-[11px] text-helm-fg3">
                  <span className={countdown < 60 ? "text-amber-400" : ""}>
                    The dashboard is restarting. Do not close this tab.
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-pulseNode-border/20 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-1000"
                    style={{ width: `${Math.max(5, ((90 - countdown) / 90) * 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* How update works */}
      {!updating && (
        <div className="rounded-xl border border-pulseNode-border/10 bg-pulseNode-navyLight p-4 space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-helm-fg3 font-semibold">How updates work</div>
          <ol className="space-y-1 text-xs text-helm-fg3 list-decimal list-inside">
            <li>Pulls the latest code from GitHub (<code className="font-mono text-helm-fg">git pull</code>)</li>
            <li>Stops all running containers (<code className="font-mono text-helm-fg">docker compose down</code>)</li>
            <li>Rebuilds and restarts with the new code (<code className="font-mono text-helm-fg">docker compose up --build -d</code>)</li>
            <li>The dashboard reconnects automatically when ready</li>
          </ol>
          <p className="text-[10px] text-helm-fg3 pt-1">
            Only available when installed via <code className="font-mono">install.sh</code> (git clone required).
          </p>
        </div>
      )}
    </div>
  )
}
