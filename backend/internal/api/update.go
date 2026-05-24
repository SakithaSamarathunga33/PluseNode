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
	// -c safe.directory bypasses ownership mismatch when the container user differs from the host file owner.
	updateLog(":: phase :: Pulling latest code from GitHub…")
	if err := streamCmd("git", "-C", workspace, "-c", "safe.directory="+workspace, "pull", "--ff-only"); err != nil {
		updateFail("git pull failed: " + err.Error())
		return
	}
	updateLog("✓ Code updated")

	// Step 2: restart containers — prefer pre-built GHCR images, fall back to source build
	updateLog(":: phase :: Updating containers…")
	updateLog("⚠ The dashboard will go offline for ~30-90s during the restart.")

	overlay := os.Getenv("PULSENODE_OVERLAY")
	if overlay == "" {
		overlay = "docker-compose.standalone.yml"
	}

	baseArgs := []string{"compose", "--env-file", workspace + "/.env.local"}
	for _, f := range []string{workspace + "/docker-compose.yml", workspace + "/" + overlay} {
		if _, err := os.Stat(f); err == nil {
			baseArgs = append(baseArgs, "-f", f)
		}
	}

	ghcrFile := workspace + "/docker-compose.ghcr.yml"
	if _, err := os.Stat(ghcrFile); err == nil {
		pullArgs := append(append([]string{}, baseArgs...), "-f", ghcrFile, "pull", "--quiet")
		updateLog("Pulling pre-built images from GitHub Container Registry…")
		if err := streamCmd("docker", pullArgs...); err == nil {
			upArgs := append(append([]string{}, baseArgs...), "-f", ghcrFile, "up", "-d")
			if err := streamCmd("docker", upArgs...); err != nil {
				updateFail("docker compose up failed: " + err.Error())
				return
			}
			updateLog("✓ Updated from pre-built images — restarting dashboard…")
			globalUpdate.mu.Lock()
			globalUpdate.running = false
			globalUpdate.mu.Unlock()
			return
		}
		updateLog("Pre-built images unavailable — building from source instead…")
	}

	updateLog("Building from source (this takes ~2-3 min)…")
	buildArgs := append(append([]string{}, baseArgs...), "up", "-d", "--build")
	if err := streamCmd("docker", buildArgs...); err != nil {
		updateFail("docker compose build failed: " + err.Error())
		return
	}
	updateLog("✓ Built and restarted — dashboard coming back online…")

	globalUpdate.mu.Lock()
	globalUpdate.running = false
	globalUpdate.mu.Unlock()
}
