const { MOCK_PM2_PROCESSES, MOCK_SYSTEM_PROCESSES } = require("./mock-data")

let pm2
try { pm2 = require("pm2") } catch { pm2 = null }

let PM2_MOCK = false

/**
 * Initialize PM2 connection. Falls back to mock if daemon unavailable.
 * @returns {Promise<void>}
 */
async function initPM2() {
  if (!pm2) {
    console.warn("[pm2] pm2 not installed — using mock data")
    PM2_MOCK = true
    return
  }
  return new Promise(resolve => {
    pm2.connect(false, err => {
      if (err) {
        console.warn("[pm2] Daemon unavailable, using mock data:", err.message)
        PM2_MOCK = true
      } else {
        console.log("[pm2] ✓ Connected to PM2 daemon")
      }
      resolve()
    })
  })
}

/**
 * Returns PM2 process list with CPU + memory stats.
 * @returns {Promise<object[]>}
 */
async function getPM2Processes() {
  if (PM2_MOCK) return MOCK_PM2_PROCESSES

  return new Promise((resolve, reject) => {
    pm2.list((err, list) => {
      if (err) return reject(err)
      resolve(
        list.map(p => ({
          pid: p.pid || 0,
          name: p.name || "",
          cpu: p.monit?.cpu ?? 0,
          mem: (p.monit?.memory ?? 0) / 1024 / 1024,
          memMb: Math.round((p.monit?.memory ?? 0) / 1024 / 1024),
          virt: "—",
          res: `${Math.round((p.monit?.memory ?? 0) / 1024 / 1024)}M`,
          cmd: p.pm2_env?.pm_exec_path || p.name || "",
          state: p.pm2_env?.status === "online" ? "R" : "S",
          time: "—",
          uptime: p.pm2_env?.pm_uptime ? formatUptime(Date.now() - p.pm2_env.pm_uptime) : "—",
          user: "pm2",
          type: "pm2",
        }))
      )
    })
  })
}

/**
 * Returns combined PM2 + system process list.
 * @returns {Promise<object[]>}
 */
async function getAllProcesses() {
  const pm2List = await getPM2Processes().catch(() => MOCK_PM2_PROCESSES)
  return [...pm2List, ...MOCK_SYSTEM_PROCESSES]
}

/**
 * Restart a PM2 app by name.
 * @param {string} name
 */
async function restartApp(name) {
  if (PM2_MOCK) return
  return new Promise((resolve, reject) => {
    pm2.restart(name, err => (err ? reject(err) : resolve()))
  })
}

/**
 * @param {number} ms
 * @returns {string}
 */
function formatUptime(ms) {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

module.exports = { initPM2, getPM2Processes, getAllProcesses, restartApp, isMock: () => PM2_MOCK }
