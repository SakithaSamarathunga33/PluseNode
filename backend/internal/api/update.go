package api

import (
	"bufio"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"sync"
	"time"
)

type updateState struct {
	mu        sync.RWMutex
	running   bool
	log       []string
	err       *string
	startedAt *time.Time
}

var globalUpdate = &updateState{}

func (s *Server) updateStatus(w http.ResponseWriter, r *http.Request) {
	globalUpdate.mu.RLock()
	defer globalUpdate.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{
		"running":   globalUpdate.running,
		"log":       globalUpdate.log,
		"error":     globalUpdate.err,
		"startedAt": globalUpdate.startedAt,
	})
}

func (s *Server) systemUpdate(w http.ResponseWriter, r *http.Request) {
	globalUpdate.mu.Lock()
	if globalUpdate.running {
		globalUpdate.mu.Unlock()
		writeJSON(w, http.StatusConflict, map[string]string{"error": "update already in progress"})
		return
	}
	now := time.Now()
	globalUpdate.running = true
	globalUpdate.log = []string{}
	globalUpdate.err = nil
	globalUpdate.startedAt = &now
	globalUpdate.mu.Unlock()

	go runUpdate()

	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
}

func updateLog(line string) {
	globalUpdate.mu.Lock()
	globalUpdate.log = append(globalUpdate.log, line)
	globalUpdate.mu.Unlock()
}

func updateFail(msg string) {
	globalUpdate.mu.Lock()
	globalUpdate.err = &msg
	globalUpdate.running = false
	globalUpdate.mu.Unlock()
}

func streamCmd(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Env = os.Environ()
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return err
	}
	cmd.Stderr = cmd.Stdout
	if err := cmd.Start(); err != nil {
		return err
	}
	scanner := bufio.NewScanner(stdout)
	for scanner.Scan() {
		updateLog(scanner.Text())
	}
	return cmd.Wait()
}

func runUpdate() {
	workspace := os.Getenv("PULSENODE_WORKSPACE") // /workspace inside container
	if workspace == "" {
		workspace = "/workspace"
	}

	// Check git is available and project is a git repo
	if _, err := os.Stat(workspace + "/.git"); err != nil {
		updateFail(fmt.Sprintf("Project directory not found at %s — was PulseNode installed via install.sh?", workspace))
		return
	}

	// Step 1: git pull
	updateLog(":: phase :: Pulling latest code from GitHub…")
	if err := streamCmd("git", "-C", workspace, "pull", "--ff-only"); err != nil {
		updateFail("git pull failed: " + err.Error())
		return
	}
	updateLog("✓ Code updated")

	// Step 2: docker compose up --build
	updateLog(":: phase :: Rebuilding and restarting containers…")
	updateLog("⚠ The dashboard will go offline for ~60-90s during the rebuild.")

	overlay := os.Getenv("PULSENODE_OVERLAY")
	if overlay == "" {
		overlay = "docker-compose.standalone.yml"
	}
	composeFiles := []string{
		workspace + "/docker-compose.yml",
		workspace + "/" + overlay,
	}
	args := []string{"compose", "--env-file", workspace + "/.env.local"}
	for _, f := range composeFiles {
		if _, err := os.Stat(f); err == nil {
			args = append(args, "-f", f)
		}
	}
	args = append(args, "up", "-d", "--build")

	if err := streamCmd("docker", args...); err != nil {
		updateFail("docker compose failed: " + err.Error())
		return
	}

	updateLog("✓ Containers rebuilt — restarting dashboard…")

	globalUpdate.mu.Lock()
	globalUpdate.running = false
	globalUpdate.mu.Unlock()
}
