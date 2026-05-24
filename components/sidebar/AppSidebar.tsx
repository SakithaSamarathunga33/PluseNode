"use client"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import Link from "next/link"
import {
  Container, BarChart3, Activity, Layers, Network,
  Database, Shield, FileCode2, BellRing,
  ChevronDown, Cpu, PanelLeftClose, PanelLeftOpen, Settings,
  FolderGit2,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { GitHubDark, Docker } from "developer-icons"
import { BorderBeam } from "@/components/magicui/border-beam"
import { NumberTicker } from "@/components/magicui/number-ticker"
import { cn } from "@/lib/utils"
import { getSocket } from "@/lib/socket"
import type { SystemMetrics } from "@/lib/types"
import { HOST } from "@/lib/mock-data"

type NavItem = {
  label: string
  href: string
  icon: LucideIcon
  devIcon?: React.ComponentType<React.SVGProps<SVGSVGElement> & { size?: number }>
  badge?: number
  alertBadge?: boolean
}

type NavSection = {
  label: string
  items: NavItem[]
}

const BASE_NAV_SECTIONS: NavSection[] = [
  {
    label: "Workspace",
    items: [
      { label: "Containers",   href: "/containers",   icon: Container, devIcon: Docker  },
      { label: "Stats",        href: "/stats",        icon: BarChart3  },
      { label: "Processes",    href: "/processes",    icon: Activity   },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "Images",       href: "/images",       icon: Layers,    badge: 18 },
      { label: "Networks",     href: "/networks",     icon: Network,   badge: 3  },
      { label: "Databases",    href: "/databases",    icon: Database,  badge: 4  },
    ],
  },
  {
    label: "Security",
    items: [
      { label: "Scan History", href: "/scan-history", icon: Shield     },
      { label: "SBOMs",        href: "/sbom-history", icon: FileCode2  },
      { label: "Alerts",       href: "/alerts",       icon: BellRing, alertBadge: true },
    ],
  },
]

const COOLIFY_ITEM: NavItem = { label: "Coolify", href: "/coolify", icon: Layers }

const DEPLOY_SECTION: NavSection = {
  label: "Deploy",
  items: [
    { label: "GitHub",   href: "/github",   icon: FolderGit2, devIcon: GitHubDark },
    { label: "Projects", href: "/projects", icon: FolderGit2  },
  ],
}

interface AppSidebarProps { alertCount?: number }

export function AppSidebar({ alertCount = 3 }: AppSidebarProps) {
  const [collapsed,       setCollapsed]       = useState(false)
  const [openSections,    setOpenSections]    = useState<Record<string, boolean>>({ Workspace: true, Resources: true, Security: true, Deploy: true })
  const [cpu,             setCpu]             = useState(HOST.cpu.usage)
  const [hasUpdate,       setHasUpdate]       = useState(false)
  const [coolifyEnabled,  setCoolifyEnabled]  = useState(false)
  const pathname = usePathname()

  // Fetch server config once on mount (non-blocking)
  useEffect(() => {
    const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""
    fetch(`${GO_API}/config`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.coolifyEnabled) setCoolifyEnabled(true) })
      .catch(() => {})
  }, [])

  // Check for updates once on mount (non-blocking)
  useEffect(() => {
    const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""
    fetch(`${GO_API}/api/system/version`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.hasUpdate) setHasUpdate(true) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const socket = getSocket()
      const handler = (m: SystemMetrics) => setCpu(m.cpu)
      socket.on("system:metrics", handler)
      return () => { socket.off("system:metrics", handler) }
    } catch { /* socket not available in SSR */ }
  }, [])

  const toggleSection = (label: string) =>
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }))

  const navSections: NavSection[] = [
    ...BASE_NAV_SECTIONS.map(section =>
    section.label === "Workspace" && coolifyEnabled
      ? { ...section, items: [...section.items, COOLIFY_ITEM] }
      : section
    ),
    DEPLOY_SECTION,
  ]

  return (
    <aside
      className="relative flex-shrink-0 h-screen flex flex-col overflow-hidden z-20 transition-[width] duration-[250ms] ease-[cubic-bezier(0.4,0,0.2,1)]"
      style={{
        width: collapsed ? 52 : 220,
        background: "var(--bg-1)",
        borderRight: "1px solid var(--border)",
      }}
    >
      {/* ── Logo ── */}
      <div
        className="h-[60px] flex items-center px-3 gap-3 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="relative flex-shrink-0 w-7 h-7">
          <span className="absolute inset-0 rounded-full animate-ping [animation-duration:2s]"
            style={{ background: "var(--acc)", opacity: 0.2 }} />
          <span
            className="relative flex w-7 h-7 rounded-full items-center justify-center"
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--acc-border)",
            }}
          >
            <Cpu size={12} style={{ color: "var(--acc)" }} />
          </span>
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0 gap-1 animate-in fade-in slide-in-from-left-2 duration-150 fill-mode-both" style={{ animationDelay: "50ms" }}>
            <span className="relative block h-[30px] w-[158px] overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logodark-removebg-preview.png"
                alt="PulseNode"
                className="theme-logo-dark h-full w-full object-contain object-left"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logo-removebg-preview.png"
                alt="PulseNode"
                className="theme-logo-light h-full w-full object-contain object-left"
              />
            </span>
            <span className="text-[9px] tracking-widest uppercase" style={{ color: "var(--fg-3)" }}>
              vps · console
            </span>
          </div>
        )}
      </div>

      {/* ── Nav ── */}
      <nav className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5">
        {navSections.map(section => (
          <div key={section.label} className="mb-1">
            {!collapsed && (
              <button
                onClick={() => toggleSection(section.label)}
                className="flex items-center justify-between w-full px-2 py-1.5 mb-0.5 group"
              >
                <span
                  className="text-[9px] font-semibold tracking-[0.14em] uppercase transition-colors"
                  style={{ color: "var(--fg-4)" }}
                >
                  {section.label}
                </span>
                <ChevronDown
                  size={10}
                  className={cn(
                    "transition-transform duration-200",
                    !openSections[section.label] && "-rotate-90"
                  )}
                  style={{ color: "var(--fg-4)" }}
                />
              </button>
            )}

            <div
              className="overflow-hidden transition-all duration-[180ms]"
              style={{ maxHeight: (collapsed || openSections[section.label]) ? "500px" : "0" }}
            >
              {section.items.map(item => {
                const isActive = pathname === item.href
                const Icon = item.icon
                const DevIcon = item.devIcon
                return (
                  <Link key={item.href} href={item.href}>
                    <div
                      className={cn(
                        "relative flex items-center gap-2.5 rounded-lg mb-px cursor-pointer transition-all duration-150 group overflow-hidden",
                        collapsed ? "px-0 py-2.5 justify-center" : "px-2.5 py-[7px]",
                      )}
                      style={{
                        background: isActive ? "var(--bg-active)" : "transparent",
                        borderLeft: isActive ? "2px solid var(--acc)" : "2px solid transparent",
                      }}
                      onMouseEnter={e => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-hover)"
                      }}
                      onMouseLeave={e => {
                        if (!isActive) (e.currentTarget as HTMLDivElement).style.background = "transparent"
                      }}
                    >
                      {isActive && (
                        <BorderBeam
                          size={100}
                          duration={6}
                          colorFrom="var(--acc)"
                          colorTo="var(--acc-2)"
                        />
                      )}
                      {DevIcon ? (
                        <DevIcon size={14} className="flex-shrink-0" />
                      ) : (
                        <Icon
                          size={14}
                          className="flex-shrink-0 transition-colors"
                          style={{ color: isActive ? "var(--acc)" : "var(--fg-3)" }}
                        />
                      )}
                      {!collapsed && (
                        <>
                          <span
                            className="text-[13px] flex-1 truncate transition-colors"
                            style={{ color: isActive ? "var(--fg)" : "var(--fg-2)", fontWeight: isActive ? 500 : 400 }}
                          >
                            {item.label}
                          </span>
                          {item.badge && (
                            <span
                              className="text-[10px] font-mono px-1.5 py-0.5 rounded-full min-w-[20px] text-center leading-none"
                              style={{ background: "var(--bg-3)", color: "var(--fg-3)" }}
                            >
                              {item.badge}
                            </span>
                          )}
                          {item.alertBadge && alertCount > 0 && (
                            <span
                              className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none"
                              style={{ background: "var(--acc)", color: "#fff" }}
                            >
                              {alertCount}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* ── Bottom strip ── */}
      <div
        className="p-3 flex-shrink-0 space-y-2"
        style={{ borderTop: "1px solid var(--border)" }}
      >
        {!collapsed && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px]" style={{ color: "var(--fg-3)" }}>CPU</span>
              <span className="text-[10px] font-mono" style={{ color: "var(--fg)" }}>
                <NumberTicker value={cpu} decimals={1} />%
              </span>
            </div>
            <div className="h-[3px] rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
              <div
                className="h-full rounded-full transition-[width] duration-[800ms] ease-out"
                style={{ background: "var(--acc)", width: `${cpu}%` }}
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 status-live"
                style={{ background: "var(--ok)" }} />
              <span className="text-[10px] truncate" style={{ color: "var(--fg-3)" }}>{HOST.name}</span>
              <span className="text-[10px] ml-auto truncate" style={{ color: "var(--fg-4)" }}>{HOST.ip}</span>
            </div>
            <p className="text-[9px] text-center pt-0.5 tracking-widest" style={{ color: "var(--fg-4)" }}>
              Infrastructure at a glance
            </p>
          </div>
        )}

        {/* Settings link */}
        <Link
          href="/settings"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors mb-1 relative ${
            pathname === "/settings"
              ? "bg-pn-electric/10 text-pn-electric"
              : "text-helm-fg3 hover:text-helm-fg hover:bg-pulseNode-border/10"
          }`}
        >
          <Settings size={14} className="flex-shrink-0" />
          {!collapsed && <span className="font-medium">Settings</span>}
          {hasUpdate && (
            <span className={`${collapsed ? "absolute -top-1 -right-1" : "ml-auto"} relative flex h-2 w-2`}>
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
            </span>
          )}
        </Link>

        <button
          onClick={() => setCollapsed(v => !v)}
          className="w-full flex items-center justify-center py-1.5 rounded-lg transition-colors"
          style={{
            background: "var(--bg-2)",
            color: "var(--fg-3)",
            border: "1px solid var(--border)",
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--fg)"
            ;(e.currentTarget as HTMLButtonElement).style.background = "var(--bg-3)"
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-3)"
            ;(e.currentTarget as HTMLButtonElement).style.background = "var(--bg-2)"
          }}
        >
          {collapsed
            ? <PanelLeftOpen size={13} />
            : <><PanelLeftClose size={12} /><span className="ml-2 text-xs">Collapse</span></>
          }
        </button>
      </div>
    </aside>
  )
}
