"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { Plus, RefreshCw, FolderGit2, GitBranch, Globe, Circle, PlayCircle } from "lucide-react"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

type Project = {
  ID: string
  Name: string
  RepoURL: string
  Branch: string
  Domain: string
  Status: string
  BuildMethod: string
  CreatedAt: string
}

const STATUS_COLORS: Record<string, string> = {
  running:  "var(--ok)",
  building: "var(--acc)",
  failed:   "var(--err)",
  idle:     "var(--fg-4)",
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading]   = useState(true)

  const fetchProjects = async () => {
    try {
      const r = await fetch(`${GO_API}/api/projects`)
      if (r.ok) setProjects(await r.json())
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchProjects() }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--fg-3)" }} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>Projects</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--fg-3)" }}>
            {projects.length} deployed project{projects.length !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          href="/projects/new"
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: "var(--acc)", color: "#fff" }}
        >
          <Plus size={14} />
          New Project
        </Link>
      </div>

      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-4 rounded-xl"
          style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <FolderGit2 size={40} style={{ color: "var(--fg-4)" }} />
          <div className="text-center">
            <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>No projects yet</p>
            <p className="text-sm mt-1" style={{ color: "var(--fg-3)" }}>
              Deploy your first project from a GitHub repository.
            </p>
          </div>
          <Link
            href="/projects/new"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            <Plus size={14} />
            Deploy a project
          </Link>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map(proj => (
            <Link
              key={proj.ID}
              href={`/projects/${proj.ID}`}
              className="block rounded-xl p-4 transition-colors hover:opacity-90"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--bg-3)" }}>
                    <FolderGit2 size={16} style={{ color: "var(--acc)" }} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm" style={{ color: "var(--fg)" }}>{proj.Name}</p>
                    <p className="text-xs truncate mt-0.5" style={{ color: "var(--fg-3)" }}>
                      {proj.RepoURL.replace("https://github.com/", "")}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-full capitalize"
                    style={{
                      background: (STATUS_COLORS[proj.Status] ?? "var(--fg-4)") + "20",
                      color: STATUS_COLORS[proj.Status] ?? "var(--fg-4)",
                    }}
                  >
                    <Circle size={6} fill="currentColor" />
                    {proj.Status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs" style={{ color: "var(--fg-3)" }}>
                <span className="flex items-center gap-1">
                  <GitBranch size={11} />
                  {proj.Branch}
                </span>
                <span className="flex items-center gap-1">
                  <Globe size={11} />
                  {proj.Domain}
                </span>
                <span className="flex items-center gap-1 ml-auto">
                  <PlayCircle size={11} />
                  {proj.BuildMethod}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
