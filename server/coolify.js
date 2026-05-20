const { MOCK_COOLIFY_PROJECTS, MOCK_COOLIFY_DEPLOYMENTS, MOCK_CONTAINERS } = require("./mock-data")

const COOLIFY_URL   = process.env.COOLIFY_API_URL
const COOLIFY_TOKEN = process.env.COOLIFY_API_TOKEN

let useRestApi = !!(COOLIFY_URL && COOLIFY_TOKEN)

/**
 * Returns Coolify projects (apps + databases + services).
 * Priority: REST API → Docker label scan → mock data.
 * @param {import('dockerode')|null} docker
 * @returns {Promise<object[]>}
 */
async function getCoolifyProjects(docker = null) {
  if (useRestApi) {
    try {
      const { default: fetch } = await import("node-fetch").catch(() => ({ default: global.fetch }))
      const res = await fetch(`${COOLIFY_URL}/api/v1/projects`, {
        headers: { Authorization: `Bearer ${COOLIFY_TOKEN}`, Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return res.json()
      useRestApi = false
    } catch (err) {
      console.warn("[coolify] REST API failed, falling back:", err.message)
      useRestApi = false
    }
  }

  if (docker) {
    try {
      return await detectFromLabels(docker)
    } catch (err) {
      console.warn("[coolify] Label detection failed:", err.message)
    }
  }

  return MOCK_COOLIFY_PROJECTS
}

/**
 * Returns recent Coolify deployment history.
 * @returns {Promise<object[]>}
 */
async function getCoolifyDeployments() {
  if (!useRestApi) return MOCK_COOLIFY_DEPLOYMENTS
  try {
    const { default: fetch } = await import("node-fetch").catch(() => ({ default: global.fetch }))
    const res = await fetch(`${COOLIFY_URL}/api/v1/deployments`, {
      headers: { Authorization: `Bearer ${COOLIFY_TOKEN}` },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) return res.json()
  } catch {}
  return MOCK_COOLIFY_DEPLOYMENTS
}

/**
 * Detect Coolify resources by reading Docker container labels.
 * @param {import('dockerode')} docker
 * @returns {Promise<object[]>}
 */
async function detectFromLabels(docker) {
  const containers = await docker.listContainers({ all: true })
  const projectMap = {}

  for (const c of containers) {
    const labels = c.Labels || {}
    if (!labels["coolify.managed"] && !isCoolifyName(c.Names?.[0] || "")) continue

    const projectName = labels["coolify.projectName"] || labels["coolify.project"] || "coolify"
    const type = labels["coolify.type"] || guessType(c.Image || "")
    const appName = labels["coolify.name"] || (c.Names?.[0] || "").replace(/^\//, "") || c.Id.slice(0, 12)
    const status = c.State === "running" ? "running" : "stopped"

    if (!projectMap[projectName]) {
      projectMap[projectName] = { id: projectName, name: capitalize(projectName), apps: [], databases: [], services: [] }
    }

    const base = { id: c.Id.slice(0, 12), name: appName, status }

    if (type === "database") {
      projectMap[projectName].databases.push({
        ...base, engine: guessEngine(c.Image || ""), size: "—", conns: 0,
      })
    } else if (type === "service") {
      const ports = c.Ports.filter(p => p.PublicPort).map(p => String(p.PublicPort))
      projectMap[projectName].services.push({ ...base, type: guessServiceType(c.Image || ""), ports })
    } else {
      const domains = parseDomains(labels)
      projectMap[projectName].apps.push({
        ...base,
        domains,
        lastDeployed: "—",
        branch: labels["coolify.branch"] || "main",
        containerName: appName,
      })
    }
  }

  return Object.values(projectMap).length > 0 ? Object.values(projectMap) : MOCK_COOLIFY_PROJECTS
}

/**
 * Annotate a container list with Coolify metadata derived from name patterns.
 * @param {object[]} containers
 * @returns {object[]}
 */
function enrichContainersWithCoolify(containers) {
  return containers.map(c => {
    if (c.coolify) return c
    if (!isCoolifyName(c.name)) return c
    return {
      ...c,
      coolify: {
        applicationId: c.id,
        projectName: "coolify",
        appName: c.name,
        type: c.name.match(/db|redis|postgres|mysql|mongo/) ? "database"
          : c.name.match(/proxy|traefik|nginx|caddy|sentinel|realtime|minio/) ? "service"
          : "application",
      },
    }
  })
}

function isCoolifyName(name) {
  const n = name.replace(/^\//, "")
  return n.startsWith("coolify") || /^[a-z0-9]{20,}$/.test(n)
}

function guessType(image) {
  if (/postgres|mysql|redis|mongo|mariadb|clickhouse/.test(image)) return "database"
  if (/traefik|nginx|caddy|minio|sentinel|realtime/.test(image)) return "service"
  return "application"
}

function guessEngine(image) {
  if (image.includes("postgres")) return "postgres"
  if (image.includes("redis"))    return "redis"
  if (image.includes("mysql") || image.includes("mariadb")) return "mysql"
  if (image.includes("mongo"))    return "mongodb"
  if (image.includes("clickhouse")) return "clickhouse"
  return "unknown"
}

function guessServiceType(image) {
  if (image.includes("traefik"))  return "Traefik"
  if (image.includes("nginx"))    return "Nginx"
  if (image.includes("minio"))    return "MinIO"
  if (image.includes("sentinel")) return "Sentinel"
  if (image.includes("realtime")) return "Soketi"
  return image.split("/").pop()?.split(":")[0] || "unknown"
}

function parseDomains(labels) {
  const raw = labels["caddy"] || labels["traefik.http.routers.app.rule"] || ""
  const matches = raw.match(/`([^`]+)`/g) || []
  return matches.map(m => m.replace(/`/g, ""))
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

module.exports = {
  getCoolifyProjects,
  getCoolifyDeployments,
  enrichContainersWithCoolify,
  isApiEnabled: () => useRestApi,
}
