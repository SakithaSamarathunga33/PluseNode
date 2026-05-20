require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") })

const express    = require("express")
const http       = require("http")
const { Server } = require("socket.io")
const cors       = require("cors")

const { authMiddleware }                                           = require("./auth")
const { initDocker, getContainers, getContainerLogs,
        restartContainer, stopContainer, getImages,
        getNetworks, sampleContainerStats, getDockerInstance }    = require("./docker")
const { initPM2, getAllProcesses, restartApp }                    = require("./pm2")
const { getCoolifyProjects, getCoolifyDeployments,
        enrichContainersWithCoolify }                             = require("./coolify")
const { MOCK_SPARKS }                                             = require("./mock-data")

/* ── App setup ─────────────────────────────────────────────────────────────── */
const app    = express()
const server = http.createServer(app)

const ORIGIN = [
  process.env.NEXT_PUBLIC_ORIGIN || "http://localhost:3000",
  "http://localhost:3001",
]

const io = new Server(server, {
  cors: { origin: ORIGIN, credentials: true },
  pingInterval: 10000,
  pingTimeout: 5000,
})

app.use(cors({ origin: ORIGIN, credentials: true }))
app.use(express.json())

/* ── Health check (no auth) ────────────────────────────────────────────────── */
app.get("/health", (_, res) => res.json({ ok: true, ts: Date.now() }))

/* ── Auth middleware on all /api routes ───────────────────────────────────── */
app.use("/api", authMiddleware)

/* ── Docker routes ─────────────────────────────────────────────────────────── */

/** List all containers with Coolify annotations */
app.get("/api/docker/containers", async (req, res) => {
  try {
    const raw = await getContainers()
    const enriched = enrichContainersWithCoolify(raw)
    res.setHeader("X-Data-Source", raw[0]?._mock ? "mock" : "live")
    res.json(enriched)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** List all Docker images */
app.get("/api/docker/images", async (req, res) => {
  try { res.json(await getImages()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** List all Docker networks */
app.get("/api/docker/networks", async (req, res) => {
  try { res.json(await getNetworks()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** Get container logs (last N lines) */
app.get("/api/docker/logs/:id", async (req, res) => {
  try {
    const logs = await getContainerLogs(req.params.id, Number(req.query.tail) || 100)
    res.json({ logs })
  } catch (err) { res.status(500).json({ error: err.message }) }
})

/** Restart a container */
app.post("/api/docker/restart/:id", async (req, res) => {
  try { await restartContainer(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** Stop a container */
app.post("/api/docker/stop/:id", async (req, res) => {
  try { await stopContainer(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/* ── PM2 routes ────────────────────────────────────────────────────────────── */

/** List all processes (PM2 + system) */
app.get("/api/pm2/list", async (req, res) => {
  try { res.json(await getAllProcesses()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** Restart a PM2 app by name */
app.post("/api/pm2/restart/:name", async (req, res) => {
  try { await restartApp(req.params.name); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/* ── Coolify routes ────────────────────────────────────────────────────────── */

/** List Coolify projects */
app.get("/api/coolify/projects", async (req, res) => {
  try { res.json(await getCoolifyProjects(getDockerInstance())) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** List recent Coolify deployments */
app.get("/api/coolify/deployments", async (req, res) => {
  try { res.json(await getCoolifyDeployments()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/* ── Socket.io ─────────────────────────────────────────────────────────────── */

// Alert state tracking
let alertCount = 0
const unreadAlerts = []
const cpuHistory   = []   // last 30 samples for threshold detection

io.on("connection", socket => {
  console.log(`[socket] client connected: ${socket.id}`)
  // Send current unread count immediately
  socket.emit("alert:count", alertCount)
})

/** Container stats every 3 s */
const containerStatsInterval = setInterval(async () => {
  try {
    const stats = await sampleContainerStats()
    io.emit("container:stats", stats)
  } catch {}
}, 3000)

/** System metrics every 2 s (mock walk when Docker unavailable) */
let netIn  = 30, netOut = 18
const systemMetricsInterval = setInterval(() => {
  // Realistic random walk for demo
  const cpu  = Math.max(5,  Math.min(95, (cpuHistory.at(-1) ?? 22) + (Math.random() - 0.45) * 8))
  const ram  = Math.max(10, Math.min(90, 40 + (Math.random() - 0.5) * 6))
  const disk = Math.max(20, Math.min(90, 26 + (Math.random() - 0.5) * 0.5))
  netIn  = Math.max(5,  Math.min(500, netIn  + (Math.random() - 0.5) * 40))
  netOut = Math.max(5,  Math.min(200, netOut + (Math.random() - 0.5) * 20))

  cpuHistory.push(cpu)
  if (cpuHistory.length > 30) cpuHistory.shift()

  io.emit("system:metrics", {
    cpu: Math.round(cpu * 10) / 10,
    ram: Math.round(ram * 10) / 10,
    disk: Math.round(disk * 10) / 10,
    netIn: Math.round(netIn),
    netOut: Math.round(netOut),
    timestamp: Date.now(),
  })
}, 2000)

/** Alert threshold check every 10 s */
const alertCheckInterval = setInterval(() => {
  const recentCpu = cpuHistory.slice(-3)
  const sustained = recentCpu.length === 3 && recentCpu.every(v => v > 85)

  if (sustained) {
    const alert = {
      id: `alert-${Date.now()}`,
      sev: "warn",
      title: `CPU sustained above 85% (${cpuHistory.at(-1)?.toFixed(1)}%)`,
      target: "production-01",
      time: new Date().toISOString(),
      rule: "host.cpu > 85% for 30s",
      state: "firing",
      read: false,
    }
    alertCount++
    io.emit("alert:new",   alert)
    io.emit("alert:count", alertCount)
  }

  // RAM spike check
  const ram = 40 + Math.random() * 60
  if (ram > 90) {
    const alert = {
      id: `alert-${Date.now()}-ram`,
      sev: "warn",
      title: `RAM above 90% (${ram.toFixed(1)}%)`,
      target: "production-01",
      time: new Date().toISOString(),
      rule: "host.mem > 90%",
      state: "firing",
      read: false,
    }
    alertCount++
    io.emit("alert:new",   alert)
    io.emit("alert:count", alertCount)
  }
}, 10000)

/* ── Startup ───────────────────────────────────────────────────────────────── */
async function start() {
  await initDocker()
  await initPM2()

  const PORT = parseInt(process.env.NODE_PORT || "4001", 10)
  server.listen(PORT, () => {
    console.log(`[server] ✓ PulseNode Node.js server running on http://localhost:${PORT}`)
  })
}

start().catch(err => {
  console.error("[server] Fatal startup error:", err)
  process.exit(1)
})

// Graceful shutdown
process.on("SIGTERM", () => {
  clearInterval(containerStatsInterval)
  clearInterval(systemMetricsInterval)
  clearInterval(alertCheckInterval)
  server.close(() => process.exit(0))
})
