"use client"

import { useState } from "react"
import type { ProvisionResult } from "@/lib/types"
import { DbIcon } from "@/components/dashboard/DbIcon"

const ENGINES = [
  { id: "postgres", label: "PostgreSQL", desc: "Relational · postgres:16-alpine" },
  { id: "mysql",    label: "MySQL",      desc: "Relational · mysql:8.0" },
  { id: "redis",    label: "Redis",      desc: "Key-value  · redis:7-alpine" },
  { id: "mongodb",  label: "MongoDB",    desc: "Document   · mongo:7" },
]

type Phase = "pick" | "provisioning" | "done" | "error"

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-helm-fg3 font-semibold">{label}</div>
      <div className="flex items-center gap-2 bg-pulseNode-navy rounded-lg px-3 py-2 border border-pulseNode-border/20">
        <code className="flex-1 text-[11px] text-helm-fg font-mono break-all">{value}</code>
        <button
          onClick={copy}
          className="flex-shrink-0 text-[10px] text-pn-electric hover:text-pn-electric/80 transition-colors font-medium"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      </div>
    </div>
  )
}

export function CreateDatabaseModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [phase,    setPhase]    = useState<Phase>("pick")
  const [engine,   setEngine]   = useState("")
  const [result,   setResult]   = useState<ProvisionResult | null>(null)
  const [errMsg,   setErrMsg]   = useState("")

  async function provision() {
    setPhase("provisioning")
    try {
      const res = await fetch("/api/database/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engine }),
        signal: AbortSignal.timeout(300_000), // 5 min — image pull can be slow
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error || `HTTP ${res.status}`)
      }
      const data = await res.json() as ProvisionResult
      setResult(data)
      setPhase("done")
      onCreated()
    } catch (e: unknown) {
      setErrMsg(e instanceof Error ? e.message : "Failed to provision")
      setPhase("error")
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-pulseNode-navyLight rounded-2xl border border-pulseNode-border/20 shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pulseNode-border/10">
          <div>
            <h2 className="text-base font-bold text-helm-fg">Create Database</h2>
            <p className="text-xs text-helm-fg3 mt-0.5">Spin up a new container on this VPS</p>
          </div>
          <button onClick={onClose} className="text-helm-fg3 hover:text-helm-fg transition-colors text-lg">✕</button>
        </div>

        <div className="p-5 space-y-5">
          {/* Engine picker */}
          {(phase === "pick") && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {ENGINES.map(e => (
                  <button
                    key={e.id}
                    onClick={() => setEngine(e.id)}
                    className={`flex flex-col items-start gap-1.5 p-3 rounded-xl border transition-all text-left ${
                      engine === e.id
                        ? "border-pn-electric/60 bg-pn-electric/10"
                        : "border-pulseNode-border/20 hover:border-pulseNode-border/40"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <DbIcon engine={e.id} size={22} />
                      <span className="font-semibold text-sm text-helm-fg">{e.label}</span>
                    </div>
                    <span className="text-[10px] text-helm-fg3">{e.desc}</span>
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-helm-fg3 bg-pulseNode-navy/50 rounded-lg px-3 py-2">
                ⏱ First-time pulls may take 1–5 minutes depending on image size and network speed.
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 border border-pulseNode-border/20 text-helm-fg3 hover:text-helm-fg rounded-xl py-2 text-sm transition-colors">
                  Cancel
                </button>
                <button
                  onClick={provision}
                  disabled={!engine}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-500 disabled:bg-pulseNode-border/20 disabled:text-helm-fg3 text-white rounded-xl py-2 text-sm font-semibold transition-colors"
                >
                  Create {engine ? ENGINES.find(e => e.id === engine)?.label : ""}
                </button>
              </div>
            </>
          )}

          {/* Provisioning */}
          {phase === "provisioning" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="w-10 h-10 border-4 border-pn-electric/20 border-t-pn-electric rounded-full animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-helm-fg">Provisioning {engine}…</p>
                <p className="text-xs text-helm-fg3 mt-1">Pulling image and starting container — please wait</p>
              </div>
            </div>
          )}

          {/* Success */}
          {phase === "done" && result && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-400">
                <span className="text-xl">✓</span>
                <span className="font-semibold">{result.name} is running</span>
              </div>
              <CopyField label="Connection String" value={result.connectionString} />
              <CopyField label="Password" value={result.password} />
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-pulseNode-navy rounded-lg p-2.5">
                  <div className="text-helm-fg3 text-[9px] uppercase tracking-wider mb-1">Container</div>
                  <div className="text-helm-fg font-mono">{result.name}</div>
                </div>
                <div className="bg-pulseNode-navy rounded-lg p-2.5">
                  <div className="text-helm-fg3 text-[9px] uppercase tracking-wider mb-1">Port</div>
                  <div className="text-helm-fg font-mono">{result.port}</div>
                </div>
              </div>
              <p className="text-[10px] text-helm-fg3">The container uses <code className="font-mono">--restart unless-stopped</code> and will survive VPS reboots.</p>
              <button onClick={onClose} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2 text-sm font-semibold transition-colors">
                Done
              </button>
            </div>
          )}

          {/* Error */}
          {phase === "error" && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 text-red-400">
                <span>✕</span>
                <p className="text-sm font-mono break-all">{errMsg}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 border border-pulseNode-border/20 text-helm-fg3 rounded-xl py-2 text-sm transition-colors">
                  Close
                </button>
                <button onClick={() => setPhase("pick")} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2 text-sm font-semibold transition-colors">
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
