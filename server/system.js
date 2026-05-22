"use strict"

const os = require("os")
const { getDockerInstance, isMock } = require("./docker")

const REPO = "SakithaSamarathunga33/vps"

// ── Version ───────────────────────────────────────────────────────────────────

let _versionCache = null
let _versionCacheAt = 0

function currentVersion() {
  // Injected at Docker build time; falls back to package.json
  return process.env.PULSENODE_VERSION || require("../package.json").version || "dev"
}

async function getVersionInfo() {
  const now = Date.now()
  if (_versionCache && now - _versionCacheAt < 3_600_000) return _versionCache

  const current = currentVersion()
  let latest = null, releaseUrl = null, changelog = null

  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "PulseNode" },
      signal: AbortSignal.timeout(6000),
    })
    if (res.ok) {
      const d = await res.json()
      latest     = d.tag_name?.replace(/^v/, "") || null
      releaseUrl = d.html_url || null
      changelog  = d.body     || null
    }
  } catch { /* network unavailable — return current only */ }

  const hasUpdate = latest ? _isNewer(latest, current) : false
  _versionCache   = { current, latest, hasUpdate, releaseUrl, changelog }
  _versionCacheAt = now
  return _versionCache
}

function _isNewer(a, b) {
  // returns true if a > b (a is newer)
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] ?? 0, vb = pb[i] ?? 0
    if (va > vb) return true
    if (va < vb) return false
  }
  return false
}

// ── Compose context detection ─────────────────────────────────────────────────

async function getComposeContext() {
  if (isMock()) return null
  const docker   = getDockerInstance()
  const hostname = os.hostname()
  const ctrs     = await docker.listContainers({ all: false })
  const self     = ctrs.find(c => c.Id.startsWith(hostname))
              || ctrs.find(c => c.Names.some(n => /node.?api/i.test(n)))
  if (!self) return null

  const L          = self.Labels || {}
  const workingDir = L["com.docker.compose.project.working_dir"]
  const configRaw  = L["com.docker.compose.project.config_files"] || ""

  if (!workingDir) return null

  // Build -f flags, mapping host paths → /workspace inside the helper container
  const flags = configRaw
    .split(",")
    .map(f => f.trim())
    .filter(Boolean)
    .map(f => `-f "${f.replace(workingDir, "/workspace")}"`)
    .join(" ")

  return { workingDir, flags }
}

// ── Update ────────────────────────────────────────────────────────────────────

// Simple in-memory update state (lost on container restart — intentional)
const updateState = { running: false, log: [], error: null, startedAt: null }

function getUpdateState() { return { ...updateState, log: [...updateState.log] } }

async function triggerUpdate() {
  if (isMock())         throw new Error("Update not available in mock mode")
  if (updateState.running) throw new Error("Update already in progress")

  const ctx = await getComposeContext()
  if (!ctx) throw new Error("Could not detect compose project directory — is this running inside Docker Compose?")

  const { workingDir, flags } = ctx

  // Build the shell script that will run inside the helper container
  const script = [
    "set -e",
    "apk add --no-cache git > /dev/null 2>&1",
    "cd /workspace",
    "echo '::pull:: Pulling latest code...'",
    "git pull",
    "echo '::down:: Stopping current services...'",
    `docker compose ${flags} down`,
    "echo '::build:: Building and starting updated services...'",
    `docker compose ${flags} up --build -d`,
    "echo '::done:: Update complete'",
  ].join("\n")

  // Reset state
  updateState.running   = true
  updateState.log       = ["Starting update helper container..."]
  updateState.error     = null
  updateState.startedAt = new Date().toISOString()

  const docker = getDockerInstance()

  try {
    const helper = await docker.createContainer({
      Image: "docker:cli",
      Cmd:   ["sh", "-c", script],
      HostConfig: {
        Binds: [
          "/var/run/docker.sock:/var/run/docker.sock",
          `${workingDir}:/workspace`,
        ],
        AutoRemove: true,
      },
    })

    // Stream helper container output into updateState.log
    const stream = await helper.attach({ stream: true, stdout: true, stderr: true })
    docker.modem.demuxStream(stream, {
      write(chunk) {
        const line = chunk.toString().trim()
        if (line) updateState.log.push(line)
      }
    }, {
      write(chunk) {
        const line = chunk.toString().trim()
        if (line) updateState.log.push("⚠ " + line)
      }
    })

    await helper.start()

    // Wait for helper to finish (up to 10 minutes)
    await new Promise((resolve, reject) => {
      helper.wait((err, data) => {
        if (err) return reject(err)
        if (data?.StatusCode !== 0) return reject(new Error(`Helper exited with code ${data?.StatusCode}`))
        resolve()
      })
    })

    updateState.running = false
  } catch (err) {
    updateState.running = false
    updateState.error   = err.message
    updateState.log.push("✕ " + err.message)
    throw err
  }
}

module.exports = { getVersionInfo, getUpdateState, triggerUpdate }
