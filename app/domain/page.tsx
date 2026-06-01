"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Copy, Globe, RefreshCw, Save, XCircle } from "lucide-react"

const GO_API = process.env.NEXT_PUBLIC_GO_API ?? ""

type Settings = {
  rootDomain: string
  expectedIp: string
  aliases: string[]
}

type CheckResult = {
  domain: string
  expectedIp: string
  records: string[]
  pointed: boolean
  proxied: boolean
  provider?: string
  message?: string
  error?: string
  checkedAt: string
}

export default function DomainPage() {
  const [rootDomain, setRootDomain] = useState("")
  const [expectedIp, setExpectedIp] = useState("")
  const [aliases, setAliases] = useState<string[]>([])
  const [checkDomain, setCheckDomain] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [checking, setChecking] = useState(false)
  const [message, setMessage] = useState("")
  const [result, setResult] = useState<CheckResult | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`${GO_API}/api/domain/settings`, { cache: "no-store" })
        if (!r.ok) return
        const d: Settings = await r.json()
        setRootDomain(d.rootDomain || "")
        setCheckDomain(d.rootDomain || "")
        setExpectedIp(d.expectedIp || "")
        setAliases(d.aliases || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const save = async () => {
    setSaving(true)
    setMessage("")
    try {
      const r = await fetch(`${GO_API}/api/domain/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rootDomain }),
      })
      const d = await r.json()
      if (!r.ok) {
        setMessage(d.error || "Failed to save domain")
        return
      }
      setRootDomain(d.rootDomain || "")
      setCheckDomain(d.rootDomain || "")
      setExpectedIp(d.expectedIp || "")
      setAliases(d.aliases || [])
      setMessage("Domain saved")
    } finally {
      setSaving(false)
    }
  }

  const check = async () => {
    setChecking(true)
    setMessage("")
    setResult(null)
    try {
      const q = encodeURIComponent(checkDomain || rootDomain)
      const r = await fetch(`${GO_API}/api/domain/check?domain=${q}`, { cache: "no-store" })
      const d = await r.json()
      if (!r.ok) {
        setMessage(d.error || "Failed to check DNS")
        return
      }
      setResult(d)
    } finally {
      setChecking(false)
    }
  }

  const copy = (value: string) => {
    navigator.clipboard.writeText(value).catch(() => {})
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <RefreshCw size={20} className="animate-spin" style={{ color: "var(--fg-3)" }} />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-xl font-semibold" style={{ color: "var(--fg)" }}>Domain</h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--fg-3)" }}>
          Set the base domain used for deployed project subdomains and verify DNS.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2">            <Globe size={16} style={{ color: "var(--acc)" }} />
            <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Base domain</h2>
          </div>

          <div>
            <label className="text-xs mb-1.5 block font-medium" style={{ color: "var(--fg-3)" }}>
              Root domain
            </label>
            <input
              value={rootDomain}
              onChange={e => setRootDomain(e.target.value)}
              placeholder="example.com"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none font-mono"
              style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
            />
          </div>

          <button
            onClick={save}
            disabled={saving || !rootDomain.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--acc)", color: "#fff" }}
          >
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
            Save Domain
          </button>

          {message && (
            <p className="text-xs" style={{ color: message.includes("Failed") ? "var(--err)" : "var(--ok)" }}>
              {message}
            </p>
          )}
        </section>

        <section className="rounded-xl p-5 space-y-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>DNS records</h2>
          <p className="text-xs" style={{ color: "var(--fg-3)" }}>
            Point both records to this VPS IP.
          </p>
          <div className="space-y-2">
            {aliases.map(alias => (
              <div key={alias} className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: "var(--bg-3)" }}>
                <code className="text-xs flex-1" style={{ color: "var(--fg)" }}>{alias}</code>
                <span className="text-xs font-mono" style={{ color: "var(--fg-3)" }}>A</span>
                <button onClick={() => copy(expectedIp)} className="p-1 rounded hover:opacity-80" title="Copy IP">
                  <Copy size={13} style={{ color: "var(--fg-3)" }} />
                </button>
              </div>
            ))}
          </div>
          <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-3)" }}>
            <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--fg-4)" }}>Expected IP</p>
            <p className="text-sm font-mono mt-0.5" style={{ color: "var(--fg)" }}>{expectedIp || "Unknown"}</p>
          </div>
        </section>
      </div>

      <section className="rounded-xl p-5 space-y-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--fg)" }}>Check DNS</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={checkDomain}
            onChange={e => setCheckDomain(e.target.value)}
            placeholder="example.com or app.example.com"
            className="flex-1 px-3 py-2 rounded-lg text-sm outline-none font-mono"
            style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
          />
          <button
            onClick={check}
            disabled={checking || !checkDomain.trim()}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            style={{ background: "var(--bg-3)", color: "var(--fg)", border: "1px solid var(--border)" }}
          >
            {checking ? <RefreshCw size={14} className="animate-spin" /> : <Globe size={14} />}
            Check
          </button>
        </div>

        {result && (
          <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2">
              {result.pointed ? (
                <CheckCircle2 size={18} style={{ color: "var(--ok)" }} />
              ) : (
                <XCircle size={18} style={{ color: "var(--err)" }} />
              )}
              <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
                {result.pointed ? (result.proxied ? "Domain is proxied through Cloudflare" : "Domain is pointed correctly") : "Domain is not pointed to this VPS"}
              </p>
            </div>
            {result.message && <p className="text-xs" style={{ color: "var(--fg-3)" }}>{result.message}</p>}
            <div className="grid gap-2 sm:grid-cols-2">
              <Info label="Expected IP" value={result.expectedIp || "Unknown"} />
              <Info label="Resolved IPs" value={result.records.length ? result.records.join(", ") : "No A/AAAA records found"} />
            </div>
            {result.error && <p className="text-xs" style={{ color: "var(--err)" }}>{result.error}</p>}
          </div>
        )}
      </section>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: "var(--bg-3)" }}>
      <p className="text-[10px] uppercase tracking-wider" style={{ color: "var(--fg-4)" }}>{label}</p>
      <p className="text-xs font-mono mt-0.5 break-all" style={{ color: "var(--fg)" }}>{value}</p>
    </div>
  )
}
