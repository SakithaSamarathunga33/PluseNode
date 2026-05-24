"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  RefreshCw, Play, Trash2, Globe, GitBranch, Circle, Clock,
  ChevronLeft, Terminal, History, Settings2, ExternalLink,
} from "lucide-react"
import Link from "next/link"
import { getSocket } from "@/lib/socket"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

type Project = {
  ID: string; Name: string; RepoURL: string; Branch: string
  Domain: string; Status: string; BuildMethod: string; Port: number
  BuildCommand: string; EnvVars: string; CreatedAt: string
}
type Deployment = {
  ID: string; Status: string; Trigger: string
  CommitSHA: string; CommitMsg: string
  StartedAt: string | null; FinishedAt: string | null; CreatedAt: string
}
type LogLine = { stream: string; line: string; ts: string }

const STATUS_COLOR: Record<string, string> = {
  running: "var(--ok)", building: "var(--acc)",
  failed: "var(--err)", idle: "var(--fg-4)", queued: "var(--acc)",
}

function age(ts: string) {
  const d = Date.now() - new Date(ts).getTime()
  if (d < 60_000) return "just now"
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`
  return `${Math.floor(d / 86_400_000)}d ago`
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [project, setProject]           = useState<Project | null>(null)
  const [deployments, setDeployments]   = useState<Deployment[]>([])
  const [logs, setLogs]                 = useState<LogLine[]>([])
  const [activeDep, setActiveDep]       = useState<string | null>(null)
  const [tab, setTab]                   = useState<"logs" | "history" | "settings">("logs")
  const [loading, setLoading]           = useState(true)
  const [deploying, setDeploying]       = useState(false)
  const [deleting, setDeleting]         = useState(false)
  const logsRef                         = useRef<HTMLDivElement>(null)
  const activeDepRef                    = useRef<string | null>(null)

  const fetchProject = useCallback(async () => {
    const r = await fetch(`${GO_API}/api/projects/${id}`)
    if (r.ok) setProject(await r.json())
  }, [id])

  const fetchDeployments = useCallback(async () => {
    const r = await fetch(`${GO_API}/api/projects/${id}/deployments`)
    if (r.ok) {
      const deps: Deployment[] = await r.json()
      setDeployments(deps)
      if (deps[0]) setActiveDep(deps[0].ID)
    }
  }, [id])

  // Load historical logs from JSON endpoint
  const loadLogs = useCallback(async (depID: string) => {
    setLogs([])
    try {
      const r = await fetch(`${GO_API}/api/projects/${id}/deployments/${depID}/logs`)
      if (r.ok) setLogs(await r.json())
    } catch { /* ignore */ }
  }, [id])

  useEffect(() => {
    Promise.all([fetchProject(), fetchDeployments()]).finally(() => setLoading(false))
  }, [fetchProject, fetchDeployments])

  // Keep ref in sync so the realtime handler always sees the current dep
  useEffect(() => { activeDepRef.current = activeDep }, [activeDep])

  useEffect(() => {
    if (activeDep) loadLogs(activeDep)
  }, [activeDep, loadLogs])

  // Listen on the realtime stream for live deploy:log events
  useEffect(() => {
    const socket = getSocket()
    const handler = (payload: unknown) => {
      const p = payload as { deploymentId: string; stream: string; line: string; ts: string }
      if (p.deploymentId !== activeDepRef.current) return
      setLogs(prev => [...prev, { stream: p.stream, line: p.line, ts: p.ts }])
      // Refresh project status when a build completes
      if (p.stream === "system" && p.line.includes("Deployment Successful")) {
        fetchProject()
        fetchDeployments()
      }
    }
    socket.on("deploy:log", handler)
    return () => socket.off("deploy:log", handler)
  }, [fetchProject, fetchDeployments])

  // Auto-scroll logs
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  const triggerDeploy = async () => {
    setDeploying(true)
    try {
      const r = await fetch(`${GO_API}/api/projects/${id}/deploy`, { method: "POST" })
      const d = await r.json()
      if (r.ok) {
        await fetchDeployments()
        setActiveDep(d.deploymentId)
        setTab("logs")
        fetchProject()
      }
    } finally { setDeploying(false) }
  }

  const deleteProject = async () => {
    if (!confirm(`Delete project "${project?.Name}"? This cannot be undone.`)) return
    setDeleting(true)
    await fetch(`${GO_API}/api/projects/${id}`, { method: "DELETE" })
    router.push("/projects")
  }

  const logColor = (stream: string) => {
    if (stream === "stderr") return "#f87171"
    if (stream === "system") return "#a78bfa"
    return "#e2e8f0"
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--fg-3)" }} />
      </div>
    )
  }
  if (!project) {
    return (
      <div className="p-6">
        <p style={{ color: "var(--fg-3)" }}>Project not found.</p>
        <Link href="/projects" className="text-sm underline mt-2 block" style={{ color: "var(--acc)" }}>
          ← Back to projects
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 pt-5 pb-4 space-y-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2">
          <Link href="/projects" className="text-xs flex items-center gap-1" style={{ color: "var(--fg-3)" }}>
            <ChevronLeft size={13} /> Projects
          </Link>
        </div>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2" style={{ color: "var(--fg)" }}>
              {project.Name}
              <span
                className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full capitalize"
                style={{
                  background: (STATUS_COLOR[project.Status] ?? "var(--fg-4)") + "20",
                  color: STATUS_COLOR[project.Status] ?? "var(--fg-4)",
                }}
              >
                <Circle size={6} fill="currentColor" />
                {project.Status}
              </span>
            </h1>
            <div className="flex items-center gap-3 text-xs mt-1" style={{ color: "var(--fg-3)" }}>
              <span className="flex items-center gap-1">
                <GitBranch size={11} />
                {project.Branch}
              </span>
              <a
                href={`https://${project.Domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:underline"
                style={{ color: "var(--acc)" }}
              >
                <Globe size={11} />
                {project.Domain}
                <ExternalLink size={9} />
              </a>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={triggerDeploy}
              disabled={deploying}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--acc)", color: "#fff" }}
            >
              {deploying ? <RefreshCw size={13} className="animate-spin" /> : <Play size={13} />}
              {deploying ? "Deploying…" : "Deploy"}
            </button>
            <button
              onClick={deleteProject}
              disabled={deleting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm"
              style={{ background: "var(--bg-2)", color: "var(--err)", border: "1px solid var(--border)" }}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-shrink-0 px-6 flex gap-1 pt-3 pb-0" style={{ borderBottom: "1px solid var(--border)" }}>
        {([
          { key: "logs",     label: "Logs",     icon: Terminal  },
          { key: "history",  label: "History",  icon: History   },
          { key: "settings", label: "Settings", icon: Settings2 },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-3 pb-2 text-xs font-medium border-b-2 transition-colors"
            style={{
              borderColor: tab === key ? "var(--acc)" : "transparent",
              color: tab === key ? "var(--acc)" : "var(--fg-3)",
            }}
          >
            <Icon size={12} />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {/* Logs tab */}
        {tab === "logs" && (
          <div className="h-full flex flex-col">
            {/* Deployment selector */}
            {deployments.length > 0 && (
              <div className="flex-shrink-0 px-6 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border)" }}>
                <span className="text-xs" style={{ color: "var(--fg-3)" }}>Deployment:</span>
                <select
                  value={activeDep ?? ""}
                  onChange={e => setActiveDep(e.target.value)}
                  className="text-xs rounded px-2 py-1 outline-none"
                  style={{ background: "var(--bg-2)", color: "var(--fg)", border: "1px solid var(--border)" }}
                >
                  {deployments.map(d => (
                    <option key={d.ID} value={d.ID}>
                      {d.ID.slice(0, 14)} — {d.Status} — {age(d.CreatedAt)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div
              ref={logsRef}
              className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5"
              style={{ background: "#0d1117" }}
            >
              {logs.length === 0 ? (
                <p style={{ color: "#6b7280" }}>Waiting for logs…</p>
              ) : (
                logs.map((entry, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <span className="select-none shrink-0" style={{ color: "#374151" }}>
                      {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                    <span style={{ color: logColor(entry.stream), wordBreak: "break-all" }}>
                      {entry.line}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* History tab */}
        {tab === "history" && (
          <div className="h-full overflow-y-auto p-6 space-y-2">
            {deployments.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--fg-3)" }}>No deployments yet.</p>
            ) : deployments.map(dep => (
              <button
                key={dep.ID}
                onClick={() => { setActiveDep(dep.ID); setTab("logs") }}
                className="w-full rounded-xl p-4 text-left transition-colors hover:opacity-80"
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-between">
                  <span
                    className="flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full capitalize"
                    style={{
                      background: (STATUS_COLOR[dep.Status] ?? "var(--fg-4)") + "20",
                      color: STATUS_COLOR[dep.Status] ?? "var(--fg-4)",
                    }}
                  >
                    <Circle size={6} fill="currentColor" />
                    {dep.Status}
                  </span>
                  <span className="text-xs" style={{ color: "var(--fg-4)" }}>
                    <Clock size={10} className="inline mr-1" />
                    {age(dep.CreatedAt)}
                  </span>
                </div>
                <p className="text-xs mt-2 font-mono truncate" style={{ color: "var(--fg-3)" }}>
                  {dep.ID}
                </p>
                {dep.CommitMsg && (
                  <p className="text-xs mt-1 truncate" style={{ color: "var(--fg)" }}>{dep.CommitMsg}</p>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <div className="h-full overflow-y-auto p-6">
            <div className="max-w-lg space-y-4">
              <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                {[
                  { label: "Project ID", value: project.ID, mono: true },
                  { label: "Repository", value: project.RepoURL },
                  { label: "Branch",     value: project.Branch },
                  { label: "Domain",     value: project.Domain, mono: true },
                  { label: "Port",       value: String(project.Port), mono: true },
                  { label: "Build Method", value: project.BuildMethod },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--fg-3)" }}>{row.label}</span>
                    <span className={row.mono ? "font-mono text-xs" : "text-xs"} style={{ color: "var(--fg)" }}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>
              <button
                onClick={deleteProject}
                disabled={deleting}
                className="w-full py-2.5 rounded-lg text-sm font-medium disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ border: "1px solid var(--err)", color: "var(--err)" }}
              >
                <Trash2 size={13} />
                Delete Project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
