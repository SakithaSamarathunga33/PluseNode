/**
 * Mock data for PulseNode Node.js server.
 * Used when Docker / PM2 / Coolify are unavailable.
 */

function walk(seed, len, base = 50, vol = 8) {
  let s = seed
  const out = []
  for (let i = 0; i < len; i++) {
    s = (s * 9301 + 49297) % 233280
    const r = s / 233280
    base += (r - 0.5) * vol
    base = Math.max(2, Math.min(98, base))
    out.push(Math.round(base * 10) / 10)
  }
  return out
}

const MOCK_CONTAINERS = [
  { id: "a1b2c3d4e5f6", name: "vps-monitor-o12w82yycon", image: "o12w82yycon4avqie5egbg75_vps-mon:latest", state: "running", uptime: "12m", created: "May 19, 6:25 AM", cpu: 0.0, ram: 0.6, ports: "3000/tcp", node: "primary" },
  { id: "b2c3d4e5f6a1", name: "z13q1pr5wxh003jbdfmgyo3b", image: "z13q1pr5wxh003jbdfmgyo3b:6e7e22", state: "running", uptime: "7h", created: "May 18, 10:47 PM", cpu: 0.0, ram: 1.5, ports: "—", node: "primary", coolify: { applicationId: "z13q1", projectName: "coolify", appName: "z13q1pr5", type: "application" } },
  { id: "c3d4e5f6a1b2", name: "xbtcom504737r6a80gucgtom", image: "xbtcom504737r6a80gucgtom:420bf1", state: "running", uptime: "2d", created: "May 16, 7:50 AM", cpu: 0.0, ram: 3.4, ports: "8080/tcp", node: "primary", coolify: { applicationId: "xbtcom", projectName: "coolify", appName: "xbtcom504737", type: "application" } },
  { id: "d4e5f6a1b2c3", name: "coolify-proxy", image: "traefik:v3.6", state: "running", uptime: "3d", created: "May 15, 8:23 PM", cpu: 0.4, ram: 1.1, ports: "80,443/tcp", node: "primary", coolify: { applicationId: "coolify-proxy", projectName: "coolify", appName: "coolify-proxy", type: "service" } },
  { id: "e5f6a1b2c3d4", name: "coolify-sentinel", image: "ghcr.io/coollabsio/sentinel:0.0.21", state: "running", uptime: "3d", created: "May 15, 8:16 PM", cpu: 0.2, ram: 0.5, ports: "—", node: "primary", coolify: { applicationId: "coolify-sentinel", projectName: "coolify", appName: "coolify-sentinel", type: "service" } },
  { id: "f6a1b2c3d4e5", name: "coolify-realtime", image: "ghcr.io/coollabsio/coolify-realtime:1.0.10", state: "running", uptime: "3d", created: "May 15, 8:16 PM", cpu: 0.1, ram: 0.8, ports: "6001/tcp", node: "primary", coolify: { applicationId: "coolify-realtime", projectName: "coolify", appName: "coolify-realtime", type: "service" } },
  { id: "a1b2c3d4e5f7", name: "coolify-db", image: "postgres:15-alpine", state: "running", uptime: "3d", created: "May 15, 8:15 PM", cpu: 0.3, ram: 2.1, ports: "5432/tcp", node: "primary", coolify: { applicationId: "coolify-db", projectName: "coolify", appName: "coolify-db", type: "database" } },
  { id: "b2c3d4e5f6a8", name: "coolify-redis", image: "redis:7-alpine", state: "running", uptime: "3d", created: "May 15, 8:15 PM", cpu: 0.1, ram: 0.4, ports: "6379/tcp", node: "primary", coolify: { applicationId: "coolify-redis", projectName: "coolify", appName: "coolify-redis", type: "database" } },
  { id: "c3d4e5f6a1b9", name: "tg-bot-prod", image: "ghcr.io/myorg/tg-bot:v0.4.2", state: "running", uptime: "6d", created: "May 13, 2:11 PM", cpu: 0.0, ram: 0.2, ports: "—", node: "primary" },
  { id: "d4e5f6a1b2c0", name: "minio-store", image: "minio/minio:RELEASE.2025-04-12", state: "running", uptime: "9d", created: "May 10, 9:02 AM", cpu: 0.5, ram: 1.8, ports: "9000,9001/tcp", node: "primary" },
  { id: "e5f6a1b2c3d1", name: "old-staging-api", image: "ghcr.io/myorg/api:v0.3.0", state: "exited", uptime: "—", created: "May 04, 11:18 AM", cpu: 0.0, ram: 0.0, ports: "—", node: "primary" },
  { id: "f6a1b2c3d4e2", name: "perftest-runner", image: "k6io/k6:0.50", state: "stopped", uptime: "—", created: "May 02, 6:40 PM", cpu: 0.0, ram: 0.0, ports: "—", node: "primary" },
]

const MOCK_IMAGES = [
  { repo: "traefik", tag: "v3.6", id: "sha256:a91c8b4f", size: "184 MB", created: "May 15", used: 1, layers: 11, vulns: { crit: 0, high: 1, med: 4, low: 12 } },
  { repo: "postgres", tag: "15-alpine", id: "sha256:7d4e221c", size: "246 MB", created: "May 15", used: 1, layers: 9, vulns: { crit: 0, high: 0, med: 2, low: 6 } },
  { repo: "redis", tag: "7-alpine", id: "sha256:c81e3aa1", size: "41 MB", created: "May 15", used: 1, layers: 7, vulns: { crit: 0, high: 0, med: 1, low: 3 } },
  { repo: "ghcr.io/coollabsio/sentinel", tag: "0.0.21", id: "sha256:6201bff0", size: "92 MB", created: "May 15", used: 1, layers: 6, vulns: { crit: 0, high: 0, med: 0, low: 2 } },
  { repo: "ghcr.io/coollabsio/coolify-realtime", tag: "1.0.10", id: "sha256:11a8eef0", size: "118 MB", created: "May 15", used: 1, layers: 9, vulns: { crit: 0, high: 2, med: 5, low: 8 } },
  { repo: "minio/minio", tag: "RELEASE.2025-04-12", id: "sha256:42cd1ab9", size: "204 MB", created: "May 10", used: 1, layers: 12, vulns: { crit: 1, high: 3, med: 7, low: 14 } },
  { repo: "ghcr.io/myorg/tg-bot", tag: "v0.4.2", id: "sha256:88d8ff32", size: "128 MB", created: "May 13", used: 1, layers: 10, vulns: { crit: 0, high: 0, med: 3, low: 9 } },
  { repo: "ghcr.io/myorg/api", tag: "v0.3.0", id: "sha256:9aa1c021", size: "162 MB", created: "May 04", used: 0, layers: 11, vulns: { crit: 2, high: 5, med: 11, low: 18 } },
  { repo: "k6io/k6", tag: "0.50", id: "sha256:e22c00dd", size: "78 MB", created: "May 02", used: 0, layers: 8, vulns: { crit: 0, high: 0, med: 1, low: 4 } },
  { repo: "node", tag: "20-bookworm-slim", id: "sha256:2010a1bb", size: "186 MB", created: "Apr 28", used: 0, layers: 8, vulns: { crit: 0, high: 1, med: 3, low: 7 } },
]

const MOCK_NETWORKS = [
  { name: "coolify", driver: "bridge", scope: "local", subnet: "172.18.0.0/16", gateway: "172.18.0.1", containers: 8, attachable: true, internal: false },
  { name: "bridge", driver: "bridge", scope: "local", subnet: "172.17.0.0/16", gateway: "172.17.0.1", containers: 2, attachable: false, internal: false },
  { name: "host", driver: "host", scope: "local", subnet: "—", gateway: "—", containers: 0, attachable: false, internal: false },
  { name: "none", driver: "null", scope: "local", subnet: "—", gateway: "—", containers: 0, attachable: false, internal: false },
  { name: "monitoring", driver: "bridge", scope: "local", subnet: "10.40.0.0/24", gateway: "10.40.0.1", containers: 3, attachable: true, internal: true },
]

const MOCK_PM2_PROCESSES = [
  { pid: 1024, user: "root", cpu: 12.4, mem: 4.2, virt: "1.4G", res: "152M", cmd: "node /app/server.js", state: "S", time: "01:22:14", type: "pm2", name: "server", memMb: 152, uptime: "1h 22m" },
  { pid: 7741, user: "node", cpu: 1.2, mem: 1.9, virt: "1.1G", res: "71M", cmd: "node next-server (v15.0)", state: "S", time: "02:44:12", type: "pm2", name: "next", memMb: 71, uptime: "2h 44m" },
]

const MOCK_SYSTEM_PROCESSES = [
  { pid: 2381, user: "postgres", cpu: 8.7, mem: 6.8, virt: "892M", res: "248M", cmd: "postgres: writer", state: "S", time: "12:04:38", type: "system" },
  { pid: 982,  user: "root",     cpu: 6.1, mem: 1.4, virt: "412M", res: "52M",  cmd: "/usr/bin/dockerd -H fd://", state: "S", time: "1d 02:18", type: "system" },
  { pid: 4012, user: "1000",     cpu: 4.3, mem: 2.1, virt: "688M", res: "76M",  cmd: "traefik --providers.docker", state: "S", time: "03:11:42", type: "system" },
  { pid: 3201, user: "redis",    cpu: 2.9, mem: 0.8, virt: "172M", res: "31M",  cmd: "redis-server *:6379", state: "S", time: "06:18:09", type: "system" },
  { pid: 1112, user: "root",     cpu: 1.7, mem: 0.6, virt: "98M",  res: "22M",  cmd: "sshd: /usr/sbin/sshd -D", state: "S", time: "1d 02:18", type: "system" },
  { pid: 1820, user: "root",     cpu: 0.9, mem: 0.3, virt: "44M",  res: "11M",  cmd: "/lib/systemd/systemd-journald", state: "S", time: "1d 02:19", type: "system" },
  { pid: 6044, user: "minio",    cpu: 0.7, mem: 1.3, virt: "1.8G", res: "48M",  cmd: "minio server /data --console-address :9001", state: "S", time: "04:08:51", type: "system" },
]

const MOCK_ALERTS = [
  { id: "a1", sev: "warn", title: "Container restarted unexpectedly", target: "minio-store", time: new Date(Date.now() - 11 * 60000).toISOString(), rule: "container.restart > 0 in 5m", state: "firing", read: false },
  { id: "a2", sev: "bad",  title: "Disk space below threshold", target: "production-01", time: new Date(Date.now() - 82 * 60000).toISOString(), rule: "disk.used_pct > 80%", state: "firing", read: false },
  { id: "a3", sev: "bad",  title: "Critical vulnerability detected in scan", target: "ghcr.io/myorg/api:v0.3.0", time: new Date(Date.now() - 360 * 60000).toISOString(), rule: "scan.severity = CRITICAL", state: "firing", read: false },
]

const MOCK_COOLIFY_PROJECTS = [
  {
    id: "coolify-system",
    name: "Coolify System",
    apps: [
      { id: "z13q1", name: "z13q1pr5wxh003jb", domains: ["app.example.com"], status: "running", lastDeployed: "May 18, 10:47 PM", branch: "main", containerName: "z13q1pr5wxh003jbdfmgyo3b" },
      { id: "xbtcom", name: "xbtcom504737r6a8", domains: ["api.example.com"], status: "running", lastDeployed: "May 16, 7:50 AM", branch: "main", containerName: "xbtcom504737r6a80gucgtom" },
    ],
    databases: [
      { id: "coolify-db", name: "coolify-db", engine: "postgres", status: "running", size: "486 MB", conns: 12 },
      { id: "coolify-redis", name: "coolify-redis", engine: "redis", status: "running", size: "108 MB", conns: 18 },
    ],
    services: [
      { id: "coolify-proxy", name: "coolify-proxy", type: "Traefik", status: "running", ports: ["80", "443"] },
      { id: "coolify-sentinel", name: "coolify-sentinel", type: "Sentinel", status: "running", ports: [] },
      { id: "coolify-realtime", name: "coolify-realtime", type: "Soketi", status: "running", ports: ["6001"] },
      { id: "minio-store", name: "minio-store", type: "MinIO", status: "running", ports: ["9000", "9001"] },
    ],
  },
]

const MOCK_COOLIFY_DEPLOYMENTS = [
  { id: "dep_001", appName: "z13q1pr5wxh003jb", branch: "main", status: "success", duration: "1m 24s", triggeredBy: "git push", timestamp: "May 18, 10:47 PM" },
  { id: "dep_002", appName: "xbtcom504737r6a8", branch: "main", status: "success", duration: "2m 08s", triggeredBy: "manual",   timestamp: "May 16, 7:50 AM"  },
  { id: "dep_003", appName: "z13q1pr5wxh003jb", branch: "main", status: "failed",  duration: "0m 42s", triggeredBy: "git push", timestamp: "May 15, 3:22 PM"  },
  { id: "dep_004", appName: "xbtcom504737r6a8", branch: "feature/update", status: "success", duration: "1m 55s", triggeredBy: "git push", timestamp: "May 14, 9:10 AM" },
]

const MOCK_SPARKS = {
  cpu:  walk(11, 60, 22, 8),
  mem:  walk(7,  60, 40, 4),
  net:  walk(23, 60, 30, 22),
  netTx:walk(33, 60, 18, 18),
  io:   walk(53, 60, 25, 30),
}

module.exports = {
  MOCK_CONTAINERS,
  MOCK_IMAGES,
  MOCK_NETWORKS,
  MOCK_PM2_PROCESSES,
  MOCK_SYSTEM_PROCESSES,
  MOCK_ALERTS,
  MOCK_COOLIFY_PROJECTS,
  MOCK_COOLIFY_DEPLOYMENTS,
  MOCK_SPARKS,
}
