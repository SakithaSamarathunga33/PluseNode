"use client"

import { usePathname, useRouter } from "next/navigation"
import { useRef, useState, useEffect, useCallback } from "react"
import { RefreshCw, Bell, Settings, Search, LayoutDashboard, HardDrive, Cpu, Network, Database, GitBranch, GitFork, AlertTriangle, Package, Terminal, ShieldCheck, FileCode, ChevronRight, LogOut } from "lucide-react"
import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

const PAGE_TITLES: Record<string, string> = {
  "/containers":   "Containers",
  "/runtime":      "Runtime Monitor",
  "/stats":        "System Stats",
  "/processes":    "Processes",
  "/coolify":      "Coolify",
  "/images":       "Images",
  "/networks":     "Networks",
  "/databases":    "Databases",
  "/scan-history": "Scan History",
  "/sbom-history": "SBOMs",
  "/alerts":       "Alerts",
  "/projects":     "Projects",
  "/github":       "GitHub",
  "/settings":     "Settings",
}

type SearchItem = {
  label: string
  description: string
  href: string
  icon: React.ReactNode
  keywords: string[]
}

const SEARCH_ITEMS: SearchItem[] = [
  {
    label: "Containers",
    description: "Manage and inspect running Docker containers",
    href: "/containers",
    icon: <LayoutDashboard size={14} />,
    keywords: ["container", "docker", "running", "logs", "shell", "exec", "restart", "stop"],
  },
  {
    label: "Runtime Monitor",
    description: "Live CPU and RAM usage for all running containers",
    href: "/runtime",
    icon: <HardDrive size={14} />,
    keywords: ["runtime", "live", "cpu", "ram", "memory", "container", "resource", "usage", "monitor"],
  },
  {
    label: "System Stats",
    description: "Live CPU, RAM, disk and network charts",
    href: "/stats",
    icon: <Cpu size={14} />,
    keywords: ["stats", "metrics", "cpu", "ram", "memory", "disk", "network", "usage", "live"],
  },
  {
    label: "Processes",
    description: "Host process list with CPU and memory usage",
    href: "/processes",
    icon: <Terminal size={14} />,
    keywords: ["process", "pid", "kill", "suspend", "resume", "pm2", "cpu", "memory"],
  },
  {
    label: "Images",
    description: "Docker images on this host",
    href: "/images",
    icon: <Package size={14} />,
    keywords: ["image", "docker", "pull", "prune", "layer", "tag"],
  },
  {
    label: "Networks",
    description: "Docker network topology and bridge info",
    href: "/networks",
    icon: <Network size={14} />,
    keywords: ["network", "bridge", "docker", "subnet", "topology", "ip"],
  },
  {
    label: "Databases",
    description: "Provision and connect to databases",
    href: "/databases",
    icon: <Database size={14} />,
    keywords: ["database", "postgres", "mysql", "redis", "mongo", "sqlite", "sql", "query", "schema", "provision"],
  },
  {
    label: "Alerts",
    description: "Alert rules and notification channels",
    href: "/alerts",
    icon: <AlertTriangle size={14} />,
    keywords: ["alert", "notification", "rule", "webhook", "slack", "email", "threshold"],
  },
  {
    label: "Projects",
    description: "Deploy projects from GitHub repositories",
    href: "/projects",
    icon: <GitBranch size={14} />,
    keywords: ["project", "deploy", "github", "repo", "build", "deployment", "branch"],
  },
  {
    label: "Coolify",
    description: "View Coolify projects and deployments",
    href: "/coolify",
    icon: <HardDrive size={14} />,
    keywords: ["coolify", "deployment", "project", "service"],
  },
  {
    label: "GitHub",
    description: "Connect GitHub account and configure OAuth",
    href: "/github",
    icon: <GitFork size={14} />,
    keywords: ["github", "oauth", "pat", "token", "repo", "repository", "connect"],
  },
  {
    label: "Scan History",
    description: "Container security vulnerability scan results",
    href: "/scan-history",
    icon: <ShieldCheck size={14} />,
    keywords: ["scan", "security", "vulnerability", "trivy", "cve", "risk"],
  },
  {
    label: "SBOMs",
    description: "Software bill of materials for your images",
    href: "/sbom-history",
    icon: <FileCode size={14} />,
    keywords: ["sbom", "bill", "materials", "dependency", "package", "syft"],
  },
  {
    label: "Settings",
    description: "System settings, updates, and login security",
    href: "/settings",
    icon: <Settings size={14} />,
    keywords: ["setting", "security", "login", "password", "update", "version", "auth"],
  },
]

function score(item: SearchItem, q: string): number {
  const ql = q.toLowerCase().trim()
  if (!ql) return 0
  const label = item.label.toLowerCase()
  const desc = item.description.toLowerCase()
  if (label === ql) return 100
  if (label.startsWith(ql)) return 80
  if (label.includes(ql)) return 60
  if (item.keywords.some(k => k.startsWith(ql))) return 50
  if (item.keywords.some(k => k.includes(ql))) return 40
  if (desc.includes(ql)) return 20
  return 0
}

export function Topbar() {
  const pathname = usePathname()
  const router   = useRouter()
  const title    = PAGE_TITLES[pathname] ?? "PulseNode"

  const [query, setQuery]       = useState("")
  const [open, setOpen]         = useState(false)
  const [active, setActive]     = useState(0)
  const [authEnabled, setAuthEnabled] = useState(false)
  const inputRef  = useRef<HTMLInputElement>(null)
  const dropRef   = useRef<HTMLDivElement>(null)

  // Only show the logout button when login protection is configured.
  useEffect(() => {
    fetch(`${GO_API}/api/auth/status`, { cache: "no-store" })
      .then(r => r.json() as Promise<{ enabled?: boolean }>)
      .then(d => setAuthEnabled(!!d.enabled))
      .catch(() => {})
  }, [])

  async function handleLogout() {
    try {
      await fetch(`${GO_API}/api/auth/logout`, { method: "POST" })
    } finally {
      // Hard navigation so middleware re-evaluates with the cleared cookie.
      window.location.href = "/login"
    }
  }

  const results = query.trim()
    ? SEARCH_ITEMS.map(item => ({ item, s: score(item, query) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.item)
    : []

  const navigate = useCallback((href: string) => {
    setQuery("")
    setOpen(false)
    router.push(href)
  }, [router])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current && !dropRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(i => Math.max(i - 1, 0)) }
    if (e.key === "Enter")     { e.preventDefault(); navigate(results[active].href) }
    if (e.key === "Escape")    { setOpen(false); inputRef.current?.blur() }
  }

  return (
    <header
      className="h-[52px] flex items-center px-5 gap-4 flex-shrink-0"
      style={{ background: "var(--bg-1)", borderBottom: "1px solid var(--border)" }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm">
        <span style={{ color: "var(--fg-3)" }}>production-01</span>
        <span style={{ color: "var(--fg-4)" }}>/</span>
        <span className="font-medium" style={{ color: "var(--fg)" }}>{title}</span>
      </div>

      {/* Search */}
      <div className="flex-1 max-w-sm mx-auto hidden md:block relative">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm"
          style={{ background: "var(--bg-2)", border: `1px solid ${open ? "var(--acc)" : "var(--border)"}`, transition: "border-color 0.15s" }}
        >
          <Search size={12} style={{ color: "var(--fg-3)" }} className="flex-shrink-0" />
          <input
            ref={inputRef}
            className="bg-transparent outline-none text-sm flex-1 min-w-0"
            style={{ color: "var(--fg)" }}
            placeholder="Search pages…"
            value={query}
            onChange={e => { setQuery(e.target.value); setOpen(e.target.value.trim().length > 0); setActive(0) }}
            onKeyDown={handleKeyDown}
          />
        </div>

        {/* Dropdown */}
        {open && (
          <div
            ref={dropRef}
            className="absolute left-0 right-0 top-[calc(100%+6px)] rounded-xl overflow-hidden z-50 py-1"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.25)" }}
          >
            {results.length > 0 ? (
              <>
                <p className="px-3 pt-1 pb-1.5 text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--fg-3)" }}>
                  Pages
                </p>
                {results.map((item, i) => (
                  <button
                    key={item.href}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left transition-colors"
                    style={{
                      background: i === active ? "var(--bg-3)" : "transparent",
                      color: "var(--fg)",
                    }}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => navigate(item.href)}
                  >
                    <span className="flex-shrink-0" style={{ color: i === active ? "var(--acc)" : "var(--fg-3)" }}>
                      {item.icon}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">{item.label}</span>
                      <span className="block text-xs truncate" style={{ color: "var(--fg-3)" }}>{item.description}</span>
                    </span>
                    <ChevronRight size={12} style={{ color: "var(--fg-4)", flexShrink: 0 }} />
                  </button>
                ))}
              </>
            ) : (
              <p className="px-3 py-3 text-sm text-center" style={{ color: "var(--fg-3)" }}>
                No pages found for &ldquo;{query}&rdquo;
              </p>
            )}
            <div className="flex items-center gap-3 px-3 py-1.5 mt-0.5" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-[10px]" style={{ color: "var(--fg-4)" }}>
                <kbd className="font-mono">↑↓</kbd> navigate
              </span>
              <span className="text-[10px]" style={{ color: "var(--fg-4)" }}>
                <kbd className="font-mono">↵</kbd> open
              </span>
              <span className="text-[10px]" style={{ color: "var(--fg-4)" }}>
                <kbd className="font-mono">Esc</kbd> close
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="ml-auto flex items-center gap-0.5">
        <AnimatedThemeToggler className="pn-icon-btn" variant="circle" duration={520} />
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: "var(--fg-3)" }}
          title="Refresh"
          onClick={() => window.location.reload()}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg-3)"
          }}
        >
          <RefreshCw size={14} />
        </button>
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: pathname === "/alerts" ? "var(--fg)" : "var(--fg-3)" }}
          title="Alerts"
          onClick={() => router.push("/alerts")}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
            ;(e.currentTarget as HTMLButtonElement).style.color = pathname === "/alerts" ? "var(--fg)" : "var(--fg-3)"
          }}
        >
          <Bell size={14} />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-red-500" />
        </button>
        <button
          className="relative p-2 rounded-lg transition-colors"
          style={{ color: pathname === "/settings" ? "var(--fg)" : "var(--fg-3)" }}
          title="Settings"
          onClick={() => router.push("/settings")}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
            ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = "transparent"
            ;(e.currentTarget as HTMLButtonElement).style.color = pathname === "/settings" ? "var(--fg)" : "var(--fg-3)"
          }}
        >
          <Settings size={14} />
        </button>
        {authEnabled && (
          <button
            className="relative p-2 rounded-lg transition-colors"
            style={{ color: "var(--fg-3)" }}
            title="Log out"
            onClick={handleLogout}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
              ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent"
              ;(e.currentTarget as HTMLButtonElement).style.color = "var(--fg-3)"
            }}
          >
            <LogOut size={14} />
          </button>
        )}
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white ml-1 flex-shrink-0"
          style={{ background: "var(--acc)" }}
        >
          SS
        </div>
      </div>
    </header>
  )
}
