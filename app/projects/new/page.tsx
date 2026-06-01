"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { GitFork, GitBranch, Globe, ChevronRight, ChevronLeft, RefreshCw, Shuffle, Check } from "lucide-react"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

type Repo = { name: string; full_name: string; private: boolean; clone_url: string; default_branch: string }

const ADJECTIVES = ["swift", "bright", "calm", "bold", "noble", "crisp", "wise"]
const NOUNS      = ["wave", "node", "peak", "star", "cloud", "ridge", "flux"]
const randomName = () =>
  ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] + "-" +
  NOUNS[Math.floor(Math.random() * NOUNS.length)] + "-" +
  Math.floor(Math.random() * 900 + 100)

export default function NewProjectPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)

  // Step 1 — pick repo
  const [repos, setRepos]           = useState<Repo[]>([])
  const [reposLoading, setReposLoading] = useState(false)
  const [repoSearch, setRepoSearch]  = useState("")
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [branches, setBranches]      = useState<string[]>([])
  const [selectedBranch, setSelectedBranch] = useState("")

  // Step 2 — configure
  const [name, setName]         = useState("")
  const [domain, setDomain]     = useState("")
  const [port, setPort]         = useState("3000")
  const [rootDomain, setRootDomain] = useState("")
  const [buildMethod, setBuildMethod] = useState("auto")
  const buildCommand = ""
  const [envText, setEnvText]   = useState("") // KEY=VALUE lines

  // Step 3 — deploy
  const [creating, setCreating] = useState(false)
  const [error, setError]       = useState("")

  const loadRepos = useCallback(async () => {
    setReposLoading(true)
    try {
      const r = await fetch(`${GO_API}/api/github/repos`)
      if (r.ok) setRepos(await r.json())
    } catch { /* ignore */ }
    finally { setReposLoading(false) }
  }, [])

  useEffect(() => { loadRepos() }, [loadRepos])

  useEffect(() => {
    fetch((process.env.NEXT_PUBLIC_GO_API ?? "") + "/api/domain/settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.rootDomain) setRootDomain(d.rootDomain) })
      .catch(() => {})
  }, [])

  const selectRepo = async (repo: Repo) => {
    setSelectedRepo(repo)
    setSelectedBranch(repo.default_branch)
    setBranches([repo.default_branch])
    // Load branches
    try {
      const r = await fetch(`${GO_API}/api/github/branches?repo=${encodeURIComponent(repo.full_name)}`)
      if (r.ok) {
        const list: string[] = await r.json()
        setBranches(list)
        if (list.includes(repo.default_branch)) setSelectedBranch(repo.default_branch)
        else if (list[0]) setSelectedBranch(list[0])
      }
    } catch { /* use default */ }
  }

  const goToStep2 = async () => {
    if (!selectedRepo) return
    setName(selectedRepo.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"))
    setDomain("")
    try {
      const r = await fetch(`${GO_API}/api/projects/free-port`)
      if (r.ok) {
        const d = await r.json()
        setPort(String(d.port))
      }
    } catch { /* keep default */ }
    setStep(2)
  }

  const parseEnvVars = (): Record<string, string> => {
    const map: Record<string, string> = {}
    for (const line of envText.split("\n")) {
      const idx = line.indexOf("=")
      if (idx > 0) {
        const k = line.slice(0, idx).trim()
        const v = line.slice(idx + 1).trim()
        if (k) map[k] = v
      }
    }
    return map
  }

  const deploy = async () => {
    if (!selectedRepo) return
    setCreating(true)
    setError("")
    try {
      const envVars = JSON.stringify(parseEnvVars())
      const r = await fetch(`${GO_API}/api/projects`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          repoUrl: selectedRepo.clone_url,
          branch: selectedBranch,
          buildMethod,
          buildCommand: buildMethod === "custom" ? buildCommand : "",
          port: parseInt(port, 10) || 3000,
          domain,
          envVars,
        }),
      })
      const proj = await r.json()
      if (!r.ok) { setError(proj.error ?? "Failed to create project"); return }

      // Trigger first deploy
      await fetch(`${GO_API}/api/projects/${proj.ID}/deploy`, { method: "POST" })
      router.push(`/projects/${proj.ID}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Network error")
    } finally { setCreating(false) }
  }

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  )

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>New Project</h1>
        <p className="text-sm mt-1" style={{ color: "var(--fg-3)" }}>Deploy from a GitHub repository</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {["Repository", "Configure", "Deploy"].map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-1 last:flex-none">
            <div className="flex items-center gap-1.5">
              <div
                className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                style={{
                  background: step > i + 1 ? "var(--ok)" : step === i + 1 ? "var(--acc)" : "var(--bg-3)",
                  color: step >= i + 1 ? "#fff" : "var(--fg-3)",
                }}
              >
                {step > i + 1 ? <Check size={10} /> : i + 1}
              </div>
              <span className="text-xs" style={{ color: step === i + 1 ? "var(--fg)" : "var(--fg-3)" }}>
                {label}
              </span>
            </div>
            {i < 2 && <div className="flex-1 h-px mx-1" style={{ background: "var(--border)" }} />}
          </div>
        ))}
      </div>

      {/* Step 1 — Select repository */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            <div className="p-3" style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}>
              <input
                type="text"
                placeholder="Search repositories…"
                value={repoSearch}
                onChange={e => setRepoSearch(e.target.value)}
                className="w-full text-sm outline-none bg-transparent"
                style={{ color: "var(--fg)" }}
              />
            </div>
            <div className="max-h-72 overflow-y-auto" style={{ background: "var(--bg-1)" }}>
              {reposLoading ? (
                <div className="flex items-center justify-center py-10">
                  <RefreshCw size={16} className="animate-spin" style={{ color: "var(--fg-3)" }} />
                </div>
              ) : filteredRepos.length === 0 ? (
                <p className="text-center text-sm py-10" style={{ color: "var(--fg-3)" }}>
                  No repositories found
                </p>
              ) : (
                filteredRepos.map(repo => (
                  <button
                    key={repo.full_name}
                    onClick={() => selectRepo(repo)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:opacity-80"
                    style={{
                      background: selectedRepo?.full_name === repo.full_name ? "var(--acc)/10" : "transparent",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <GitFork size={14} style={{ color: "var(--fg-3)", flexShrink: 0 }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: "var(--fg)" }}>
                        {repo.full_name}
                      </p>
                      <p className="text-xs" style={{ color: "var(--fg-3)" }}>
                        {repo.private ? "Private" : "Public"} · {repo.default_branch}
                      </p>
                    </div>
                    {selectedRepo?.full_name === repo.full_name && (
                      <Check size={14} className="ml-auto flex-shrink-0" style={{ color: "var(--acc)" }} />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {selectedRepo && (
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <p className="text-xs font-medium" style={{ color: "var(--fg-3)" }}>Branch</p>
              <select
                value={selectedBranch}
                onChange={e => setSelectedBranch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
              >
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
          )}

          <button
            onClick={goToStep2}
            disabled={!selectedRepo}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            Continue
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Step 2 — Configure */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-sm pb-2" style={{ borderBottom: "1px solid var(--border)", color: "var(--fg-3)" }}>
              <GitFork size={13} />
              <span>{selectedRepo?.full_name}</span>
              <GitBranch size={13} className="ml-1" />
              <span>{selectedBranch}</span>
            </div>

            {/* Name */}
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>Project Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
              />
            </div>

            {/* Domain */}
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>
                Domain
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={domain}
                  onChange={e => setDomain(e.target.value)}
                  placeholder="app.yourdomain.com"
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
                  style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
                />
                <button
                  onClick={() => setDomain(randomName() + "." + (rootDomain || "example.com"))}
                  title="Generate subdomain"
                  className="px-3 py-2 rounded-lg transition-colors"
                  style={{ background: "var(--bg-3)", color: "var(--fg-3)", border: "1px solid var(--border)" }}
                >
                  <Shuffle size={14} />
                </button>
              </div>
              <p className="text-[10px] mt-1" style={{ color: "var(--fg-4)" }}>
                <Globe size={9} className="inline mr-1" />
                Must point to this server via DNS
              </p>
            </div>

            {/* Port */}
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>Container Port</label>
              <input
                type="number"
                value={port}
                onChange={e => setPort(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
              />
            </div>

            {/* Build method */}
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>Build Method</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { value: "auto",       label: "Auto-detect",  desc: "Compose → Dockerfile → Nixpacks" },
                  { value: "compose",    label: "Docker Compose", desc: "docker-compose.yml" },
                  { value: "dockerfile", label: "Dockerfile",   desc: "docker build" },
                  { value: "nixpacks",   label: "Nixpacks",     desc: "Zero-config build" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setBuildMethod(opt.value)}
                    className="p-3 rounded-lg text-left transition-colors"
                    style={{
                      background: buildMethod === opt.value ? "var(--acc)/10" : "var(--bg-3)",
                      border: `1px solid ${buildMethod === opt.value ? "var(--acc)" : "var(--border)"}`,
                    }}
                  >
                    <p className="text-xs font-medium" style={{ color: buildMethod === opt.value ? "var(--acc)" : "var(--fg)" }}>
                      {opt.label}
                    </p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--fg-4)" }}>{opt.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Env vars */}
            <div>
              <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>
                Environment Variables
              </label>
              <textarea
                value={envText}
                onChange={e => setEnvText(e.target.value)}
                placeholder={"NODE_ENV=production\nPORT=3000\nDATABASE_URL=postgres://…"}
                rows={4}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono resize-y"
                style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
              />
              <p className="text-[10px] mt-1" style={{ color: "var(--fg-4)" }}>One KEY=VALUE per line</p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
              style={{ background: "var(--bg-2)", color: "var(--fg-3)", border: "1px solid var(--border)" }}
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!name || !domain}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-40"
              style={{ background: "var(--acc)", color: "#fff" }}
            >
              Review & Deploy
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review & deploy */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--fg-3)" }}>Summary</p>
            {[
              { label: "Repository", value: selectedRepo?.full_name ?? "" },
              { label: "Branch",     value: selectedBranch },
              { label: "Name",       value: name },
              { label: "Domain",     value: domain },
              { label: "Port",       value: port },
              { label: "Build",      value: buildMethod },
            ].map(row => (
              <div key={row.label} className="flex items-center justify-between text-sm">
                <span style={{ color: "var(--fg-3)" }}>{row.label}</span>
                <span className="font-mono text-xs" style={{ color: "var(--fg)" }}>{row.value}</span>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-sm px-3 py-2 rounded-lg" style={{ background: "var(--err)/10", color: "var(--err)" }}>
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
              style={{ background: "var(--bg-2)", color: "var(--fg-3)", border: "1px solid var(--border)" }}
            >
              <ChevronLeft size={14} />
              Back
            </button>
            <button
              onClick={deploy}
              disabled={creating}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium disabled:opacity-60"
              style={{ background: "var(--acc)", color: "#fff" }}
            >
              {creating ? (
                <><RefreshCw size={14} className="animate-spin" /> Deploying…</>
              ) : (
                <>Deploy Project</>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
