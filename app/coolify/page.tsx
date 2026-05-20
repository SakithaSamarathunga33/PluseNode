"use client"

import { useRef, useState, useEffect } from "react"
import { useGSAP } from "@gsap/react"
import gsap from "gsap"
import { COOLIFY_PROJECTS as MOCK_PROJECTS, COOLIFY_DEPLOYMENTS as MOCK_DEPLOYMENTS } from "@/lib/mock-data"
import { nodeApi } from "@/lib/api"
import type { CoolifyProject, CoolifyDeployment } from "@/lib/types"
import { StatCard } from "@/components/dashboard/StatCard"
import { Pill } from "@/components/dashboard/Pill"
import BlurFade from "@/components/magicui/blur-fade"
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

/* ── Engine colour for Coolify databases ────────────────────────────── */
const ENGINE_TONE: Record<string, string> = {
  postgres: "var(--db-postgres)",
  redis:    "var(--db-redis)",
  mysql:    "var(--db-mysql)",
}

function EnginePill({ engine }: { engine: string }) {
  const color = ENGINE_TONE[engine] ?? "var(--db-other)"
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {engine}
    </span>
  )
}

/* ── Status pill helper ─────────────────────────────────────────────── */
function statusTone(s: string): "ok" | "bad" | "warn" {
  if (s === "running")  return "ok"
  if (s === "stopped")  return "bad"
  return "warn"
}

/* ── Deployment status cell ─────────────────────────────────────────── */
function DeployStatus({ status }: { status: string }) {
  if (status === "success") return <Pill tone="ok" dot>success</Pill>
  if (status === "failed")  return <Pill tone="bad" dot>failed</Pill>
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 status-live" />
      running
    </span>
  )
}

/* ── Sub-section header ─────────────────────────────────────────────── */
function SubHeader({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-xs font-semibold text-helm-fg">{title}</span>
      <span className="px-1.5 py-0.5 rounded-full bg-pulseNode-navy text-[10px] text-helm-fg3 font-mono">
        {count}
      </span>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function CoolifyPage() {
  const container  = useRef<HTMLDivElement>(null)
  const [projects,     setProjects]     = useState<CoolifyProject[]>(MOCK_PROJECTS)
  const [deployments,  setDeployments]  = useState<CoolifyDeployment[]>(MOCK_DEPLOYMENTS)

  useEffect(() => {
    nodeApi.get<CoolifyProject[]>("/api/coolify/projects")
      .then(({ data }) => setProjects(data))
      .catch(() => {})
    nodeApi.get<CoolifyDeployment[]>("/api/coolify/deployments")
      .then(({ data }) => setDeployments(data))
      .catch(() => {})
  }, [])

  useGSAP(() => {
    gsap.from(".gsap-enter", {
      y: 20, opacity: 0, duration: 0.5, stagger: 0.08, ease: "power2.out",
    })
  }, { scope: container })

  /* Aggregate stats */
  const totalApps = projects.reduce((s, p) => s + p.apps.length, 0)
  const totalDbs  = projects.reduce((s, p) => s + p.databases.length, 0)
  const runningServices = projects.reduce(
    (s, p) => s + p.services.filter(sv => sv.status === "running").length, 0
  )

  return (
    <div ref={container} className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-helm-fg">Coolify</h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-pn-blue/15 text-pn-blue uppercase tracking-wider">
              Labels
            </span>
          </div>
          <p className="text-sm text-helm-fg3 mt-0.5">
            Self-hosted deployment platform · Docker label detection
          </p>
        </div>
        <div className="flex gap-2">
          <button className="border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg px-3 py-1.5 rounded-lg text-sm transition-colors">
            Refresh
          </button>
          <button className="bg-pn-electric text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-pn-electric/90 transition-colors">
            Open Dashboard
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="gsap-enter">
          <StatCard label="Total Apps"         value={totalApps}       tone="acc" />
        </div>
        <div className="gsap-enter">
          <StatCard label="Running Services"   value={runningServices} tone="ok"  />
        </div>
        <div className="gsap-enter">
          <StatCard label="Managed Databases"  value={totalDbs}        tone="info" />
        </div>
        <div className="gsap-enter">
          <StatCard label="Deployments"        value={deployments.length} tone="acc" />
        </div>
      </div>

      {/* Projects accordion */}
      <div className="space-y-3">
        {projects.map(project => (
          <div key={project.id} className="gsap-enter rounded-xl border border-pulseNode-border/10 overflow-hidden bg-pulseNode-navyLight shadow-card">
            <Accordion multiple={false} defaultValue={[project.id]}>
              <AccordionItem value={project.id} className="border-0">
                <AccordionTrigger
                  className={cn(
                    "px-4 py-3 hover:no-underline",
                    "bg-pulseNode-navyLight hover:bg-pulseNode-navy/50 transition-colors",
                    "[&>svg]:text-helm-fg3",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-sm text-helm-fg">{project.name}</span>
                    <span className="inline-flex items-center gap-1 text-[10px] text-helm-fg3">
                      <span className="bg-pn-cyan/10 text-pn-cyan px-1.5 py-0.5 rounded font-mono">
                        {project.apps.length} apps
                      </span>
                      <span className="bg-[#336791]/15 text-[#336791] px-1.5 py-0.5 rounded font-mono">
                        {project.databases.length} dbs
                      </span>
                      <span className="bg-pulseNode-navy/60 text-helm-fg3 px-1.5 py-0.5 rounded font-mono">
                        {project.services.length} services
                      </span>
                    </span>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="bg-pulseNode-navy/30 px-4 pb-4 pt-2 border-t border-pulseNode-border/10">
                  <BlurFade delay={0.05}>
                    <div className="space-y-6">

                      {/* Applications */}
                      {project.apps.length > 0 && (
                        <div>
                          <SubHeader title="Applications" count={project.apps.length} />
                          <div className="rounded-lg overflow-hidden border border-pulseNode-border/10">
                            <table className="pn-table w-full">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Domains</th>
                                  <th>Status</th>
                                  <th>Last Deployed</th>
                                  <th>Branch</th>
                                  <th>Container</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.apps.map(app => (
                                  <tr key={app.id}>
                                    <td className="font-medium text-helm-fg">{app.name}</td>
                                    <td>
                                      <div className="flex flex-wrap gap-1">
                                        {app.domains.map(d => (
                                          <code key={d} className="text-[11px] bg-pulseNode-navy/60 px-1.5 py-0.5 rounded text-pn-cyan">
                                            {d}
                                          </code>
                                        ))}
                                      </div>
                                    </td>
                                    <td>
                                      <Pill tone={statusTone(app.status)} dot>{app.status}</Pill>
                                    </td>
                                    <td className="dim">{app.lastDeployed}</td>
                                    <td>
                                      <code className="text-[11px] bg-pulseNode-navy/60 px-1.5 py-0.5 rounded text-helm-fg3">
                                        {app.branch}
                                      </code>
                                    </td>
                                    <td className="mono-cell dim text-[11px]">{app.containerName}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Databases */}
                      {project.databases.length > 0 && (
                        <div>
                          <SubHeader title="Databases" count={project.databases.length} />
                          <div className="rounded-lg overflow-hidden border border-pulseNode-border/10">
                            <table className="pn-table w-full">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Engine</th>
                                  <th>Status</th>
                                  <th className="right">Size</th>
                                  <th className="right">Connections</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.databases.map(db => (
                                  <tr key={db.id}>
                                    <td className="font-medium text-helm-fg">{db.name}</td>
                                    <td><EnginePill engine={db.engine} /></td>
                                    <td>
                                      <Pill tone={statusTone(db.status)} dot>{db.status}</Pill>
                                    </td>
                                    <td className="right dim">{db.size}</td>
                                    <td className="right dim">{db.conns}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Services */}
                      {project.services.length > 0 && (
                        <div>
                          <SubHeader title="Services" count={project.services.length} />
                          <div className="rounded-lg overflow-hidden border border-pulseNode-border/10">
                            <table className="pn-table w-full">
                              <thead>
                                <tr>
                                  <th>Name</th>
                                  <th>Type</th>
                                  <th>Status</th>
                                  <th>Ports</th>
                                </tr>
                              </thead>
                              <tbody>
                                {project.services.map(svc => (
                                  <tr key={svc.id}>
                                    <td className="font-medium text-helm-fg">{svc.name}</td>
                                    <td className="dim">{svc.type}</td>
                                    <td>
                                      <Pill tone={statusTone(svc.status)} dot>{svc.status}</Pill>
                                    </td>
                                    <td>
                                      {svc.ports.length > 0
                                        ? (
                                          <div className="flex flex-wrap gap-1">
                                            {svc.ports.map(p => (
                                              <code key={p} className="text-[11px] bg-pulseNode-navy/60 px-1.5 py-0.5 rounded text-helm-fg3">
                                                {p}
                                              </code>
                                            ))}
                                          </div>
                                        )
                                        : <span className="text-helm-fg3 text-xs">—</span>
                                      }
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                    </div>
                  </BlurFade>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        ))}
      </div>

      {/* Recent Deployments */}
      <div className="gsap-enter bg-pulseNode-navyLight rounded-xl border border-pulseNode-border/10 shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-pulseNode-border/10">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-helm-fg">Recent Deployments</span>
            <span className="px-1.5 py-0.5 rounded-full bg-pulseNode-navy text-[10px] text-helm-fg3 font-mono">
              {deployments.length}
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="pn-table w-full">
            <thead>
              <tr>
                <th>App Name</th>
                <th>Branch</th>
                <th>Status</th>
                <th className="right">Duration</th>
                <th>Triggered By</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {deployments.map(dep => (
                <tr key={dep.id}>
                  <td className="font-medium text-helm-fg">{dep.appName}</td>
                  <td>
                    <code className="text-[11px] bg-pulseNode-navy/60 px-1.5 py-0.5 rounded text-helm-fg3">
                      {dep.branch}
                    </code>
                  </td>
                  <td><DeployStatus status={dep.status} /></td>
                  <td className="right dim">{dep.duration}</td>
                  <td className="dim">{dep.triggeredBy}</td>
                  <td className="dim">{dep.timestamp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Data source badge */}
      <div className="flex justify-center pb-2">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium bg-pn-blue/10 text-pn-blue border border-pn-blue/20">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Data source: Docker Labels
        </span>
      </div>
    </div>
  )
}
