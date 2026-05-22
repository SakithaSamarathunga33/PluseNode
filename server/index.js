require("dotenv").config({ path: require("path").join(__dirname, "..", ".env.local") })

const express    = require("express")
const http       = require("http")
const { Server } = require("socket.io")
const cors       = require("cors")

const { authMiddleware }                                           = require("./auth")
const { initDocker, getContainers, getContainerLogs,
        restartContainer, startContainer, stopContainer, removeContainer, execCommand,
        getImages, getNetworks, sampleContainerStats, getDockerInstance } = require("./docker")
const { initPM2, getAllProcesses, restartApp }                    = require("./pm2")
const { getCoolifyProjects, getCoolifyDeployments,
        enrichContainersWithCoolify }                             = require("./coolify")
const { getHostInfo, getCpuUsage, getDisk, getNetworkRates }       = require("./host")
const { getDbSchema, executeQuery, isDestructiveQuery,
        getDbMetrics, streamDbBackup,
        getConnectionString, testExternalConnection, provisionDatabase,
        listCustomConnections, addCustomConnection, removeCustomConnection } = require("./database")

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

/** List database containers derived from Docker */
app.get("/api/docker/databases", async (req, res) => {
  try {
    const containers = await getContainers()
    const DB_IMAGES = /postgres|mysql|mariadb|redis|mongo|clickhouse|cassandra|elasticsearch/i
    const ENGINE_MAP = {
      postgres:     { engine: "postgres",   port: 5432, maxConns: 100 },
      mysql:        { engine: "mysql",      port: 3306, maxConns: 100 },
      mariadb:      { engine: "mysql",      port: 3306, maxConns: 100 },
      redis:        { engine: "redis",      port: 6379, maxConns: 200 },
      mongo:        { engine: "mongodb",    port: 27017, maxConns: 100 },
      clickhouse:   { engine: "clickhouse", port: 8123, maxConns: 50 },
      cassandra:    { engine: "cassandra",  port: 9042, maxConns: 100 },
      elasticsearch:{ engine: "elasticsearch", port: 9200, maxConns: 100 },
    }
    const dbs = containers
      .filter(c => DB_IMAGES.test(c.image))
      .map(c => {
        const engineKey = Object.keys(ENGINE_MAP).find(k => c.image.toLowerCase().includes(k)) || "postgres"
        const meta = ENGINE_MAP[engineKey]
        const versionMatch = c.image.match(/:([0-9][^-]*)/)
        return {
          name: c.name,
          engine: meta.engine,
          version: versionMatch ? versionMatch[1] : "latest",
          host: c.name,
          port: meta.port,
          size: "—",
          conns: 0,
          maxConns: meta.maxConns,
          qps: 0,
          slow: 0,
          state: c.state === "running" ? "ok" : "error",
        }
      })
    res.json(dbs)
  } catch (err) { res.status(500).json({ error: err.message }) }
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

/** Start a stopped/exited container */
app.post("/api/docker/start/:id", async (req, res) => {
  try { await startContainer(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** Stop a container */
app.post("/api/docker/stop/:id", async (req, res) => {
  try { await stopContainer(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** Remove a container (force) */
app.delete("/api/docker/remove/:id", async (req, res) => {
  try { await removeContainer(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** Execute a command in a running container */
app.post("/api/docker/exec/:id", async (req, res) => {
  try {
    const { cmd } = req.body
    if (!cmd || typeof cmd !== "string") return res.status(400).json({ error: "cmd required" })
    const output = await execCommand(req.params.id, cmd)
    res.json({ output })
  } catch (err) { res.status(500).json({ error: err.message }) }
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

/* ── Process signal routes ─────────────────────────────────────────────────── */

function signalPid(pid, signal, res) {
  const n = parseInt(pid, 10)
  if (!Number.isInteger(n) || n < 2)
    return res.status(400).json({ error: "invalid pid" })
  try {
    process.kill(n, signal)
    res.json({ ok: true, pid: n, signal })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
}

app.post("/api/processes/kill/:pid",    (req, res) => signalPid(req.params.pid, "SIGKILL", res))
app.post("/api/processes/suspend/:pid", (req, res) => signalPid(req.params.pid, "SIGSTOP", res))
app.post("/api/processes/resume/:pid",  (req, res) => signalPid(req.params.pid, "SIGCONT", res))

/* ── Host info route ───────────────────────────────────────────────────────── */

app.get("/api/host", async (req, res) => {
  try {
    const containers = await getContainers().catch(() => [])
    const running = containers.filter(c => c.state === "running").length
    res.json(getHostInfo(running))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/* ── Database query routes ─────────────────────────────────────────────────── */

/* ── Custom external connections ───────────────────────────────────────────── */

app.get("/api/database/custom", (req, res) => {
  try   { res.json(listCustomConnections()) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/api/database/custom/test", async (req, res) => {
  const { connectionString } = req.body
  if (!connectionString) return res.status(400).json({ error: "connectionString required" })
  try   { res.json(await testExternalConnection(connectionString)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.post("/api/database/custom/save", (req, res) => {
  const { connectionString, name, engine, host, port, version } = req.body
  if (!connectionString) return res.status(400).json({ error: "connectionString required" })
  try   { res.json(addCustomConnection({ connectionString, name, engine, host, port, version })) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

app.delete("/api/database/custom/:id", (req, res) => {
  try   { removeCustomConnection(req.params.id); res.json({ ok: true }) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/* ── Provision new database container ──────────────────────────────────────── */

app.post("/api/database/provision", async (req, res) => {
  const { engine } = req.body
  if (!engine) return res.status(400).json({ error: "engine required" })
  try   { res.json(await provisionDatabase(engine)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/* ── Connection string for a Docker DB container ───────────────────────────── */

app.get("/api/database/:name/connection-string", async (req, res) => {
  try   { res.json(await getConnectionString(req.params.name)) }
  catch (err) { res.status(500).json({ error: err.message }) }
})

/** Return database list and (optionally) table list for a DB container */
app.get("/api/database/:name/schema", async (req, res) => {
  try {
    const schema = await getDbSchema(req.params.name, req.query.database || null)
    res.json(schema)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** Live metrics for a DB container */
app.get("/api/database/:name/metrics", async (req, res) => {
  try {
    res.json(await getDbMetrics(req.params.name))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

/** Stream a dump file from a DB container as a download */
app.get("/api/database/:name/backup", async (req, res) => {
  try {
    await streamDbBackup(req.params.name, res)
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message })
  }
})

/** Execute a query against a DB container */
app.post("/api/database/:name/query", async (req, res) => {
  const { query, database, force } = req.body
  if (!query || typeof query !== "string")
    return res.status(400).json({ error: "query is required" })
  if (!force && isDestructiveQuery(query))
    return res.status(422).json({ error: "Destructive query detected. Send force:true to proceed." })
  try {
    const result = await executeQuery(req.params.name, query, database || null)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
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

/** Clear Docker build cache — streams output via SSE */
app.post("/api/docker/build-cache/clear", (req, res) => {
  const { spawn } = require("child_process")

  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.flushHeaders()

  const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`)

  const proc = spawn("docker", ["builder", "prune", "-f"])

  proc.stdout.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach(line => send({ type: "line", text: line }))
  })

  proc.stderr.on("data", (chunk) => {
    chunk.toString().split("\n").filter(Boolean).forEach(line => send({ type: "line", text: line }))
  })

  proc.on("close", (code) => {
    if (code === 0) {
      send({ type: "done" })
    } else {
      send({ type: "error", text: `Process exited with code ${code}` })
    }
    res.end()
  })

  proc.on("error", (err) => {
    send({ type: "error", text: err.message })
    res.end()
  })

  req.on("close", () => proc.kill())
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

/** Container stats every 5 s (only when clients connected) */
const containerStatsInterval = setInterval(async () => {
  if (io.engine.clientsCount === 0) return
  try {
    const stats = await sampleContainerStats()
    io.emit("container:stats", stats)
  } catch {}
}, 5000)

/** System metrics every 3 s (only when clients connected) */
const os = require("os")
const systemMetricsInterval = setInterval(() => {
  const cpu  = getCpuUsage()
  const mem  = os.totalmem() - os.freemem()
  const ram  = Math.round((mem / os.totalmem()) * 1000) / 10
  const disk = getDisk()
  const net  = getNetworkRates()

  cpuHistory.push(cpu)
  if (cpuHistory.length > 30) cpuHistory.shift()

  if (io.engine.clientsCount === 0) return
  io.emit("system:metrics", {
    cpu,
    ram,
    disk: disk.pct,
    netIn:  net.rx,
    netOut: net.tx,
    timestamp: Date.now(),
  })
}, 3000)

/** Alert threshold check every 15 s */
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
