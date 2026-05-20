const { MOCK_CONTAINERS, MOCK_IMAGES, MOCK_NETWORKS } = require("./mock-data")

let Docker
try { Docker = require("dockerode") } catch { Docker = null }

let docker = null
let DOCKER_MOCK = false

/**
 * Initialize Docker connection. Falls back to mock if socket unavailable.
 * @returns {Promise<void>}
 */
async function initDocker() {
  if (!Docker) {
    console.warn("[docker] dockerode not installed — using mock data")
    DOCKER_MOCK = true
    return
  }
  try {
    docker = new Docker()
    await docker.ping()
    console.log("[docker] ✓ Connected to Docker socket")
  } catch (err) {
    console.warn("[docker] Unavailable, using mock data:", err.message)
    DOCKER_MOCK = true
  }
}

/**
 * Returns list of all containers (running + stopped) with basic stats.
 * @returns {Promise<object[]>}
 */
async function getContainers() {
  if (DOCKER_MOCK) return MOCK_CONTAINERS.map(c => ({ ...c, _mock: true }))

  const list = await withTimeout(docker.listContainers({ all: true }), 8000)
  if (!list) return MOCK_CONTAINERS.map(c => ({ ...c, _mock: true }))
  return list.map(c => ({
    id: c.Id.slice(0, 12),
    name: (c.Names[0] || "").replace(/^\//, ""),
    image: c.Image,
    state: c.State,
    uptime: c.Status,
    cpu: 0,
    ram: 0,
    ports: c.Ports
      .filter(p => p.PublicPort)
      .map(p => `${p.PublicPort}/${p.Type}`)
      .join(", ") || "—",
    created: new Date(c.Created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    node: "primary",
  }))
}

/**
 * Returns last N lines of container logs as a string.
 * @param {string} id
 * @param {number} [tail=100]
 * @returns {Promise<string>}
 */
async function getContainerLogs(id, tail = 100) {
  if (DOCKER_MOCK) {
    const lines = Array.from({ length: 20 }, (_, i) =>
      `[mock] 2025-05-19T0${i}:00:00Z INFO Container log line ${i + 1}`
    )
    return lines.join("\n")
  }
  const container = docker.getContainer(id)
  const stream = await container.logs({ stdout: true, stderr: true, tail, timestamps: true })
  return stream.toString().replace(/[\x00-\x08\x0E-\x1F]/g, "")
}

/**
 * Restart a container by ID.
 * @param {string} id
 */
async function restartContainer(id) {
  if (DOCKER_MOCK) return
  await docker.getContainer(id).restart()
}

/**
 * Stop a container by ID.
 * @param {string} id
 */
async function stopContainer(id) {
  if (DOCKER_MOCK) return
  await docker.getContainer(id).stop()
}

/**
 * List all Docker images.
 * @returns {Promise<object[]>}
 */
async function getImages() {
  if (DOCKER_MOCK) return MOCK_IMAGES

  const list = await docker.listImages()
  return list.map(img => {
    const [repo, tag] = (img.RepoTags?.[0] || "<none>:latest").split(":")
    return {
      repo,
      tag: tag || "latest",
      id: img.Id.replace("sha256:", "").slice(0, 12),
      size: `${(img.Size / 1024 / 1024).toFixed(0)} MB`,
      created: new Date(img.Created * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      used: 0,
      layers: img.RootFS?.Layers?.length || 0,
      vulns: { crit: 0, high: 0, med: 0, low: 0 },
    }
  })
}

/**
 * List all Docker networks with attached container counts.
 * @returns {Promise<object[]>}
 */
async function getNetworks() {
  if (DOCKER_MOCK) return MOCK_NETWORKS

  const list = await docker.listNetworks()
  return list.map(n => ({
    name: n.Name,
    driver: n.Driver,
    scope: n.Scope,
    subnet: n.IPAM?.Config?.[0]?.Subnet || "—",
    gateway: n.IPAM?.Config?.[0]?.Gateway || "—",
    containers: Object.keys(n.Containers || {}).length,
    attachable: Boolean(n.Attachable),
    internal: Boolean(n.Internal),
  }))
}

/**
 * Race a promise against a timeout. Returns null if the timeout fires first.
 */
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms)),
  ])
}

/**
 * Sample per-container CPU + RAM stats for the socket.io loop.
 * Each container stats call is capped at 2 s to prevent blocking the server.
 * @returns {Promise<Array<{containerId:string, cpu:number, ram:number}>>}
 */
async function sampleContainerStats() {
  if (DOCKER_MOCK) {
    return MOCK_CONTAINERS
      .filter(c => c.state === "running")
      .map(c => ({
        containerId: c.id,
        cpu: Math.max(0, c.cpu + (Math.random() - 0.5) * 3),
        ram: Math.max(0, c.ram + (Math.random() - 0.5) * 2),
      }))
  }

  const running = await withTimeout(docker.listContainers(), 5000)
  if (!running) return []

  const stats = await Promise.all(
    running.slice(0, 12).map(async c => {
      try {
        const s = await withTimeout(
          docker.getContainer(c.Id).stats({ stream: false }),
          2000
        )
        if (!s) return { containerId: c.Id.slice(0, 12), cpu: 0, ram: 0 }

        const cpuDelta = s.cpu_stats.cpu_usage.total_usage - s.precpu_stats.cpu_usage.total_usage
        const sysDelta = (s.cpu_stats.system_cpu_usage || 0) - (s.precpu_stats.system_cpu_usage || 0)
        const numCpu = s.cpu_stats.online_cpus || 1
        const cpu = sysDelta > 0 ? (cpuDelta / sysDelta) * numCpu * 100 : 0
        const ram = s.memory_stats.limit > 0
          ? (s.memory_stats.usage / s.memory_stats.limit) * 100
          : 0
        return { containerId: c.Id.slice(0, 12), cpu: Math.round(cpu * 10) / 10, ram: Math.round(ram * 10) / 10 }
      } catch {
        return { containerId: c.Id.slice(0, 12), cpu: 0, ram: 0 }
      }
    })
  )
  return stats
}

/** @returns {import('dockerode') | null} */
function getDockerInstance() { return docker }

module.exports = {
  initDocker,
  getContainers,
  getContainerLogs,
  restartContainer,
  stopContainer,
  getImages,
  getNetworks,
  sampleContainerStats,
  getDockerInstance,
  isMock: () => DOCKER_MOCK,
}
