package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"pulsenode/api/docker"
)

type ContainerHandler struct{ dc *docker.Client }

func NewContainerHandler(dc *docker.Client) *ContainerHandler {
	return &ContainerHandler{dc: dc}
}

// List returns all containers with normalised fields.
func (h *ContainerHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		w.Header().Set("X-Data-Source", "mock")
		writeJSON(w, 200, mockContainerList())
		return
	}
	raw, err := h.dc.ListContainers(true)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	list := make([]map[string]interface{}, 0, len(raw))
	for _, c := range raw {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		ports := []string{}
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				ports = append(ports, fmt.Sprintf("%d/%s", p.PublicPort, p.Type))
			}
		}
		portStr := "—"
		if len(ports) > 0 {
			portStr = strings.Join(ports, ", ")
		}
		list = append(list, map[string]interface{}{
			"id":      c.ID[:min(12, len(c.ID))],
			"name":    name,
			"image":   c.Image,
			"state":   c.State,
			"uptime":  c.Status,
			"cpu":     0,
			"ram":     0,
			"ports":   portStr,
			"created": time.Unix(c.Created, 0).Format("Jan 2"),
			"node":    "primary",
		})
	}
	writeJSON(w, 200, list)
}

// Images lists Docker images.
func (h *ContainerHandler) Images(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeJSON(w, 200, mockImages())
		return
	}
	raw, err := h.dc.ListImages()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	list := make([]map[string]interface{}, 0, len(raw))
	for _, img := range raw {
		repoTag := "<none>:latest"
		if len(img.RepoTags) > 0 {
			repoTag = img.RepoTags[0]
		}
		parts := strings.SplitN(repoTag, ":", 2)
		repo := parts[0]
		tag := "latest"
		if len(parts) == 2 {
			tag = parts[1]
		}
		list = append(list, map[string]interface{}{
			"repo":    repo,
			"tag":     tag,
			"id":      strings.TrimPrefix(img.ID, "sha256:")[:min(12, len(strings.TrimPrefix(img.ID, "sha256:")))],
			"size":    docker.FormatSize(img.Size),
			"created": time.Unix(img.Created, 0).Format("Jan 2"),
			"used":    0,
			"layers":  len(img.RootFS.Layers),
			"vulns":   map[string]int{"crit": 0, "high": 0, "med": 0, "low": 0},
		})
	}
	writeJSON(w, 200, list)
}

// Networks lists Docker networks.
func (h *ContainerHandler) Networks(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeJSON(w, 200, mockNetworks())
		return
	}
	raw, err := h.dc.ListNetworks()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	list := make([]map[string]interface{}, 0, len(raw))
	for _, n := range raw {
		subnet := "—"
		gateway := "—"
		if len(n.IPAM.Config) > 0 {
			subnet = n.IPAM.Config[0].Subnet
			gateway = n.IPAM.Config[0].Gateway
		}
		list = append(list, map[string]interface{}{
			"name":       n.Name,
			"driver":     n.Driver,
			"scope":      n.Scope,
			"subnet":     subnet,
			"gateway":    gateway,
			"containers": len(n.Containers),
			"attachable": n.Attachable,
			"internal":   n.Internal,
		})
	}
	writeJSON(w, 200, list)
}

// Databases lists containers that appear to be database engines.
func (h *ContainerHandler) Databases(w http.ResponseWriter, r *http.Request) {
	containers, err := h.dc.ListContainers(true)
	if err != nil || h.dc.IsMock() {
		writeJSON(w, 200, mockDatabases())
		return
	}
	type engCfg struct {
		engine  string
		port    int
		maxConn int
	}
	engineMap := map[string]engCfg{
		"postgres":      {"postgres", 5432, 100},
		"mysql":         {"mysql", 3306, 100},
		"mariadb":       {"mysql", 3306, 100},
		"redis":         {"redis", 6379, 200},
		"mongo":         {"mongodb", 27017, 100},
		"clickhouse":    {"clickhouse", 8123, 50},
		"cassandra":     {"cassandra", 9042, 100},
		"elasticsearch": {"elasticsearch", 9200, 100},
	}
	dbPattern := strings.Join([]string{"postgres", "mysql", "mariadb", "redis", "mongo", "clickhouse", "cassandra", "elasticsearch"}, "|")
	var list []map[string]interface{}
	for _, c := range containers {
		imgLower := strings.ToLower(c.Image)
		matched := false
		for key, cfg := range engineMap {
			if strings.Contains(imgLower, key) {
				name := ""
				if len(c.Names) > 0 {
					name = strings.TrimPrefix(c.Names[0], "/")
				}
				version := "latest"
				for _, part := range strings.Split(c.Image, ":") {
					if len(part) > 0 && part[0] >= '0' && part[0] <= '9' {
						version = part
						break
					}
				}
				list = append(list, map[string]interface{}{
					"name":     name,
					"engine":   cfg.engine,
					"version":  version,
					"host":     name,
					"port":     cfg.port,
					"size":     "—",
					"conns":    0,
					"maxConns": cfg.maxConn,
					"qps":      0,
					"slow":     0,
					"state":    map[bool]string{true: "ok", false: "error"}[c.State == "running"],
				})
				matched = true
				break
			}
		}
		_ = dbPattern
		_ = matched
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	writeJSON(w, 200, list)
}

// Logs returns the last N lines of container logs.
func (h *ContainerHandler) Logs(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	tail := 100
	if t := r.URL.Query().Get("tail"); t != "" {
		if n, err := strconv.Atoi(t); err == nil {
			tail = n
		}
	}
	if h.dc.IsMock() {
		lines := make([]string, 20)
		for i := range lines {
			lines[i] = fmt.Sprintf("[mock] 2025-05-01T0%d:00:00Z INFO Log line %d", i%10, i+1)
		}
		writeJSON(w, 200, map[string]string{"logs": strings.Join(lines, "\n")})
		return
	}
	logs, err := h.dc.ContainerLogs(id, tail)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"logs": logs})
}

func (h *ContainerHandler) Restart(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		ok(w)
		return
	}
	if err := h.dc.RestartContainer(r.PathValue("id")); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	ok(w)
}

func (h *ContainerHandler) Start(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		ok(w)
		return
	}
	if err := h.dc.StartContainer(r.PathValue("id")); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	ok(w)
}

func (h *ContainerHandler) Stop(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		ok(w)
		return
	}
	if err := h.dc.StopContainer(r.PathValue("id")); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	ok(w)
}

func (h *ContainerHandler) Remove(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		ok(w)
		return
	}
	if err := h.dc.RemoveContainer(r.PathValue("id")); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	ok(w)
}

func (h *ContainerHandler) Exec(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Cmd string `json:"cmd"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Cmd == "" {
		writeErr(w, 400, "cmd required")
		return
	}
	if h.dc.IsMock() {
		writeJSON(w, 200, map[string]string{"output": "$ " + body.Cmd + "\n[mock] simulated output"})
		return
	}
	execID, err := h.dc.ExecCreate(r.PathValue("id"), []string{"sh", "-c", body.Cmd})
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	out, err := h.dc.ExecStart(execID)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"output": out})
}

func (h *ContainerHandler) ClearBuildCache(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.WriteHeader(200)
	flusher, _ := w.(http.Flusher)

	send := func(obj map[string]string) {
		b, _ := json.Marshal(obj)
		fmt.Fprintf(w, "data: %s\n\n", b)
		if flusher != nil {
			flusher.Flush()
		}
	}

	if h.dc.IsMock() {
		send(map[string]string{"type": "error", "text": "Docker unavailable"})
		return
	}
	send(map[string]string{"type": "line", "text": "Pruning build cache via Docker API..."})
	result, err := h.dc.PruneBuilder()
	if err != nil {
		send(map[string]string{"type": "error", "text": err.Error()})
		return
	}
	mb := float64(result.SpaceReclaimed) / 1024 / 1024
	send(map[string]string{"type": "line", "text": fmt.Sprintf("Space reclaimed: %.1f MB", mb)})
	send(map[string]string{"type": "done"})
}

// ── Mock data ─────────────────────────────────────────────────────────────────

func mockContainerList() []map[string]interface{} {
	return []map[string]interface{}{
		{"id": "mock000000001", "name": "nginx-proxy", "image": "nginx:alpine", "state": "running", "uptime": "Up 3 days", "cpu": 1.2, "ram": 8.4, "ports": "80/tcp, 443/tcp", "created": "May 19", "node": "primary"},
		{"id": "mock000000002", "name": "postgres-db", "image": "postgres:16-alpine", "state": "running", "uptime": "Up 7 days", "cpu": 4.8, "ram": 32.1, "ports": "5432/tcp", "created": "May 12", "node": "primary"},
		{"id": "mock000000003", "name": "redis-cache", "image": "redis:7-alpine", "state": "running", "uptime": "Up 2 days", "cpu": 0.6, "ram": 5.2, "ports": "6379/tcp", "created": "May 17", "node": "primary"},
		{"id": "mock000000004", "name": "app-worker", "image": "node:20-alpine", "state": "exited", "uptime": "Exited 1h ago", "cpu": 0, "ram": 0, "ports": "—", "created": "May 18", "node": "primary"},
	}
}

func mockImages() []map[string]interface{} {
	return []map[string]interface{}{
		{"repo": "nginx", "tag": "alpine", "id": "abc123def456", "size": "45 MB", "created": "May 1", "used": 1, "layers": 6, "vulns": map[string]int{"crit": 0, "high": 0, "med": 1, "low": 2}},
		{"repo": "postgres", "tag": "16-alpine", "id": "def456abc123", "size": "240 MB", "created": "Apr 20", "used": 1, "layers": 8, "vulns": map[string]int{"crit": 0, "high": 1, "med": 2, "low": 5}},
	}
}

func mockNetworks() []map[string]interface{} {
	return []map[string]interface{}{
		{"name": "bridge", "driver": "bridge", "scope": "local", "subnet": "172.17.0.0/16", "gateway": "172.17.0.1", "containers": 3, "attachable": false, "internal": false},
		{"name": "pulsenode_default", "driver": "bridge", "scope": "local", "subnet": "172.20.0.0/16", "gateway": "172.20.0.1", "containers": 4, "attachable": true, "internal": false},
	}
}

func mockDatabases() []map[string]interface{} {
	return []map[string]interface{}{
		{"name": "postgres-db", "engine": "postgres", "version": "16", "host": "postgres-db", "port": 5432, "size": "—", "conns": 0, "maxConns": 100, "qps": 0, "slow": 0, "state": "ok"},
		{"name": "redis-cache", "engine": "redis", "version": "7", "host": "redis-cache", "port": 6379, "size": "—", "conns": 0, "maxConns": 200, "qps": 0, "slow": 0, "state": "ok"},
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// Hostname for region detection.
var _ = os.Hostname
