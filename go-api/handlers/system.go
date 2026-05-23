package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"pulsenode/api/docker"
)

const repo = "SakithaSamarathunga33/vps"

type SystemHandler struct {
	dc          *docker.Client
	mu          sync.Mutex
	versionCache map[string]interface{}
	versionAt   time.Time
	updateState  updateStatus
}

type updateStatus struct {
	Running   bool     `json:"running"`
	Log       []string `json:"log"`
	Error     string   `json:"error,omitempty"`
	StartedAt string   `json:"startedAt,omitempty"`
}

func NewSystemHandler(dc *docker.Client) *SystemHandler {
	return &SystemHandler{dc: dc}
}

func (h *SystemHandler) Version(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	if h.versionCache != nil && time.Since(h.versionAt) < time.Hour {
		cached := h.versionCache
		h.mu.Unlock()
		writeJSON(w, 200, cached)
		return
	}
	h.mu.Unlock()

	current := currentVersion()
	info := map[string]interface{}{
		"current":    current,
		"latest":     nil,
		"hasUpdate":  false,
		"releaseUrl": nil,
		"changelog":  nil,
	}

	client := &http.Client{Timeout: 6 * time.Second}
	req, _ := http.NewRequest(http.MethodGet,
		"https://api.github.com/repos/"+repo+"/releases/latest", nil)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "PulseNode")
	if resp, err := client.Do(req); err == nil {
		defer resp.Body.Close()
		var d struct {
			TagName string `json:"tag_name"`
			HTMLURL string `json:"html_url"`
			Body    string `json:"body"`
		}
		if json.NewDecoder(resp.Body).Decode(&d) == nil {
			latest := strings.TrimPrefix(d.TagName, "v")
			info["latest"] = latest
			info["hasUpdate"] = isNewer(latest, current)
			info["releaseUrl"] = d.HTMLURL
			info["changelog"] = d.Body
		}
	}

	h.mu.Lock()
	h.versionCache = info
	h.versionAt = time.Now()
	h.mu.Unlock()
	writeJSON(w, 200, info)
}

func (h *SystemHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	st := h.updateState
	h.mu.Unlock()
	writeJSON(w, 200, st)
}

func (h *SystemHandler) Update(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeErr(w, 503, "update not available in mock mode")
		return
	}
	h.mu.Lock()
	if h.updateState.Running {
		h.mu.Unlock()
		writeErr(w, 409, "update already in progress")
		return
	}
	h.mu.Unlock()

	go h.triggerUpdate()
	writeJSON(w, 200, map[string]interface{}{
		"started": true,
		"message": "Update started. The dashboard will restart shortly.",
	})
}

func (h *SystemHandler) triggerUpdate() {
	ctx := &contextDetect{dc: h.dc}
	workingDir, flags, err := ctx.detect()
	if err != nil {
		h.mu.Lock()
		h.updateState.Error = err.Error()
		h.mu.Unlock()
		return
	}

	script := strings.Join([]string{
		"set -e",
		"apk add --no-cache git > /dev/null 2>&1",
		"cd /workspace",
		"echo '::pull:: Pulling latest code...'",
		"git pull",
		"echo '::down:: Stopping current services...'",
		"docker compose " + flags + " down",
		"echo '::build:: Building and starting updated services...'",
		"docker compose " + flags + " up --build -d",
		"echo '::done:: Update complete'",
	}, "\n")

	h.mu.Lock()
	h.updateState = updateStatus{
		Running:   true,
		Log:       []string{"Starting update helper container..."},
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	h.mu.Unlock()

	cfg := docker.CreateContainerConfig{
		Image: "docker:cli",
		Cmd:   []string{"sh", "-c", script},
		HostConfig: docker.CreateHostConfig{
			Binds: []string{
				"/var/run/docker.sock:/var/run/docker.sock",
				workingDir + ":/workspace",
			},
		},
	}
	cid, err := h.dc.CreateContainer(cfg)
	if err != nil {
		h.mu.Lock()
		h.updateState.Running = false
		h.updateState.Error = err.Error()
		h.mu.Unlock()
		return
	}
	if err := h.dc.StartContainer(cid); err != nil {
		h.mu.Lock()
		h.updateState.Running = false
		h.updateState.Error = err.Error()
		h.mu.Unlock()
		return
	}

	// Poll container logs and wait for completion
	for {
		time.Sleep(2 * time.Second)
		logs, _ := h.dc.ContainerLogs(cid, 20)
		if logs != "" {
			h.mu.Lock()
			h.updateState.Log = append(h.updateState.Log, strings.Split(logs, "\n")...)
			h.mu.Unlock()
		}
		// Check if container finished
		ctrs, _ := h.dc.ListContainers(true)
		finished := true
		for _, c := range ctrs {
			if c.ID == cid {
				if c.State == "running" {
					finished = false
				}
				break
			}
		}
		if finished {
			break
		}
	}

	h.mu.Lock()
	h.updateState.Running = false
	h.mu.Unlock()
}

type contextDetect struct{ dc *docker.Client }

func (c *contextDetect) detect() (workingDir, flags string, err error) {
	ctrs, err := c.dc.ListContainers(false)
	if err != nil {
		return "", "", err
	}
	hostname, _ := os.Hostname()
	var self *docker.Container
	for i := range ctrs {
		if strings.HasPrefix(ctrs[i].ID, hostname) {
			self = &ctrs[i]
			break
		}
	}
	if self == nil {
		for i := range ctrs {
			for _, n := range ctrs[i].Names {
				if strings.Contains(strings.ToLower(n), "go-api") ||
					strings.Contains(strings.ToLower(n), "pulsenode") {
					self = &ctrs[i]
					break
				}
			}
		}
	}
	if self == nil {
		return "", "", fmt.Errorf("could not detect compose project container")
	}
	workingDir = self.Labels["com.docker.compose.project.working_dir"]
	if workingDir == "" {
		return "", "", fmt.Errorf("could not detect compose working directory")
	}
	configRaw := self.Labels["com.docker.compose.project.config_files"]
	var fflags []string
	for _, f := range strings.Split(configRaw, ",") {
		f = strings.TrimSpace(f)
		if f != "" {
			fflags = append(fflags, `-f "`+strings.ReplaceAll(f, workingDir, "/workspace")+`"`)
		}
	}
	flags = strings.Join(fflags, " ")
	return workingDir, flags, nil
}

func currentVersion() string {
	if v := os.Getenv("PULSENODE_VERSION"); v != "" {
		return v
	}
	return "dev"
}

func isNewer(a, b string) bool {
	pa := splitVer(a)
	pb := splitVer(b)
	for i := 0; i < max2(len(pa), len(pb)); i++ {
		va, vb := 0, 0
		if i < len(pa) {
			va, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			vb, _ = strconv.Atoi(pb[i])
		}
		if va > vb {
			return true
		}
		if va < vb {
			return false
		}
	}
	return false
}

func splitVer(v string) []string { return strings.Split(v, ".") }
func max2(a, b int) int {
	if a > b {
		return a
	}
	return b
}
