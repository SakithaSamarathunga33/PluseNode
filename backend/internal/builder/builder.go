package builder

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// LogFunc is called for each output line from the build process.
type LogFunc func(stream, line string)

// Config holds all information needed to run one deployment.
type Config struct {
	DeploymentID string
	ProjectID    string
	ProjectName  string
	RepoURL      string // already authorised for private repos
	Branch       string
	Method       Method // auto | compose | dockerfile | nixpacks
	BuildCommand string // optional override
	Port         int
	Domain       string
	EnvVars      string // JSON {"KEY":"VALUE"}
	TraefikNet   string
	PrevContainerID string // previous running container, removed after the new one is healthy
	Log          LogFunc
}

// Result is the outcome of a successful build.
type Result struct {
	ContainerID string
	CommitSHA   string // full SHA of the built commit
	CommitMsg   string // first line of the commit message
	ImageTag    string // docker image:tag produced (empty for compose); enables rollback
}

// healthTimeout is how long a new container has to become healthy before the
// deploy is considered failed and rolled back. stableWindow is how long a
// container without its own HEALTHCHECK must stay up to be deemed healthy.
const (
	healthTimeout = 90 * time.Second
	stableWindow  = 6 * time.Second
)

// Run clones the repo, builds, and starts the container.
// Returns the running container and the commit that was built.
func Run(ctx context.Context, cfg Config) (Result, error) {
	tmpDir, err := os.MkdirTemp("", "pn-build-*")
	if err != nil {
		return Result{}, fmt.Errorf("mktemp: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	cfg.log("system", "=== PulseNode Build Started ===")
	cfg.log("system", fmt.Sprintf("Repo: %s  Branch: %s", cfg.RepoURL, cfg.Branch))

	// 1. Clone
	cfg.log("system", "→ Cloning repository…")
	if err := cfg.run(ctx, tmpDir, "git", "clone", "--depth", "1", "--branch", cfg.Branch, cfg.RepoURL, "."); err != nil {
		return Result{}, fmt.Errorf("clone: %w", err)
	}

	// Capture the commit that was actually checked out.
	commitSHA, commitMsg := CommitInfo(tmpDir)
	if commitSHA != "" {
		cfg.log("system", fmt.Sprintf("→ Building commit %s — %s", shortSHA(commitSHA), commitMsg))
	}

	// 2. Detect method if auto
	method := cfg.Method
	if method == "auto" || method == "" {
		method = Detect(tmpDir)
		cfg.log("system", fmt.Sprintf("→ Auto-detected build method: %s", method))
	} else {
		cfg.log("system", fmt.Sprintf("→ Build method: %s", method))
	}

	// 3. Parse env vars
	envMap := map[string]string{}
	if cfg.EnvVars != "" && cfg.EnvVars != "{}" {
		_ = json.Unmarshal([]byte(cfg.EnvVars), &envMap)
	}

	slug := sanitizeName(cfg.ProjectName)
	// Tag the image per-deploy (pn-<slug>:<shortSHA>) so a previous image stays
	// available for rollback instead of being overwritten each build.
	verTag := shortSHA(commitSHA)
	if verTag == "" {
		verTag = shortID(cfg.DeploymentID)
	}
	imageRef := fmt.Sprintf("pn-%s:%s", slug, verTag)

	// 4. Build & run
	res := Result{CommitSHA: commitSHA, CommitMsg: commitMsg}
	switch method {
	case MethodCompose:
		// Compose manages its own images/services; no single image to tag or roll back.
		res.ContainerID, err = cfg.buildCompose(ctx, tmpDir, fmt.Sprintf("pn-%s", slug), envMap)
	case MethodDockerfile:
		res.ContainerID, err = cfg.buildDockerfile(ctx, tmpDir, imageRef, slug, envMap)
		res.ImageTag = imageRef
	case MethodNixpacks:
		res.ContainerID, err = cfg.buildNixpacks(ctx, tmpDir, imageRef, slug, envMap)
		res.ImageTag = imageRef
	default:
		return Result{}, fmt.Errorf("unknown build method: %s", method)
	}
	if err != nil {
		return Result{}, err
	}

	cfg.log("system", fmt.Sprintf("✓ Container healthy: %s", res.ContainerID[:min(12, len(res.ContainerID))]))
	cfg.log("system", fmt.Sprintf("✓ Live at https://%s", cfg.Domain))
	return res, nil
}

// RunFromImage redeploys a previously-built image (rollback) without cloning or
// rebuilding. The image must still exist locally. It uses the same zero-downtime
// swap + health gate as a normal deploy.
func RunFromImage(ctx context.Context, cfg Config, imageRef string) (Result, error) {
	cfg.log("system", "=== PulseNode Rollback Started ===")
	cfg.log("system", "→ Redeploying image "+imageRef)
	if err := runSilent(ctx, "docker", "image", "inspect", imageRef); err != nil {
		return Result{}, fmt.Errorf("image %s is no longer available locally (it may have been pruned)", imageRef)
	}
	envMap := map[string]string{}
	if cfg.EnvVars != "" && cfg.EnvVars != "{}" {
		_ = json.Unmarshal([]byte(cfg.EnvVars), &envMap)
	}
	cid, err := cfg.deployContainer(ctx, imageRef, sanitizeName(cfg.ProjectName), envMap)
	if err != nil {
		return Result{}, err
	}
	cfg.log("system", fmt.Sprintf("✓ Rolled back. Live at https://%s", cfg.Domain))
	return Result{ContainerID: cid, ImageTag: imageRef}, nil
}

// shortID returns the trailing 8 chars of a deployment id (after the prefix).
func shortID(id string) string {
	if i := strings.LastIndex(id, "_"); i >= 0 && i+1 < len(id) {
		id = id[i+1:]
	}
	if len(id) > 8 {
		return id[len(id)-8:]
	}
	return id
}

// shortSHA returns the first 7 characters of a commit SHA.
func shortSHA(sha string) string {
	if len(sha) > 7 {
		return sha[:7]
	}
	return sha
}

func (cfg Config) buildCompose(ctx context.Context, dir, containerName string, envMap map[string]string) (string, error) {
	// Write overlay with Traefik labels for the first service
	cfg.log("system", "→ Writing Traefik labels overlay…")
	traefikNet := cfg.resolveTraefikNetwork(ctx)
	if traefikNet == "" {
		return "", fmt.Errorf("TRAEFIK_NETWORK is not configured and no Traefik Docker network could be detected")
	}
	overlay := cfg.composeOverlay(traefikNet)
	if err := os.WriteFile(filepath.Join(dir, "docker-compose.pulsenode.yml"), []byte(overlay), 0o644); err != nil {
		return "", err
	}

	// Write .env for compose
	if _, ok := envMap["PORT"]; !ok {
		envMap["PORT"] = fmt.Sprintf("%d", cfg.Port)
	}
	if len(envMap) > 0 {
		cfg.log("system", "→ Writing .env file…")
		var sb strings.Builder
		for k, v := range envMap {
			fmt.Fprintf(&sb, "%s=%s\n", k, v)
		}
		if err := os.WriteFile(filepath.Join(dir, ".env"), []byte(sb.String()), 0o600); err != nil {
			return "", err
		}
	}

	cfg.log("system", "→ Building and starting containers…")
	if err := cfg.run(ctx, dir, "docker", "compose",
		"-f", "docker-compose.yml",
		"-f", "docker-compose.pulsenode.yml",
		"up", "-d", "--build"); err != nil {
		return "", fmt.Errorf("compose up: %w", err)
	}

	// Get first running container name from compose project
	out, err := runOutput(ctx, dir, "docker", "compose",
		"-f", "docker-compose.yml",
		"-f", "docker-compose.pulsenode.yml",
		"ps", "-q")
	if err != nil || strings.TrimSpace(out) == "" {
		return "compose-unknown", nil
	}
	ids := strings.Fields(strings.TrimSpace(out))
	return ids[0][:min(12, len(ids[0]))], nil
}

func (cfg Config) buildDockerfile(ctx context.Context, dir, imageRef, slug string, envMap map[string]string) (string, error) {
	cfg.log("system", "→ Building Docker image…")
	if err := cfg.run(ctx, dir, "docker", "build", "-t", imageRef, "."); err != nil {
		return "", fmt.Errorf("docker build: %w", err)
	}
	return cfg.deployContainer(ctx, imageRef, slug, envMap)
}

// defaultNodeVersion is injected for Node projects that don't pin their own
// version. Nixpacks otherwise defaults to Node 18, which is too old for modern
// frameworks (e.g. Next.js 16 requires Node >= 20.9.0).
const defaultNodeVersion = "20"

func (cfg Config) buildNixpacks(ctx context.Context, dir, imageRef, slug string, envMap map[string]string) (string, error) {
	cfg.log("system", "→ Building with Nixpacks (this may take a few minutes)…")
	args := []string{"build", dir, "--name", imageRef}
	// NIXPACKS_NODE_VERSION overrides engines.node/.nvmrc, so only inject a
	// default when the project hasn't pinned a version itself.
	if isNodeProject(dir) && !pinsNodeVersion(dir) {
		cfg.log("system", fmt.Sprintf("→ No Node version pinned; defaulting to Node %s", defaultNodeVersion))
		args = append(args, "--env", "NIXPACKS_NODE_VERSION="+defaultNodeVersion)
	}
	if err := cfg.run(ctx, dir, "nixpacks", args...); err != nil {
		return "", fmt.Errorf("nixpacks build: %w", err)
	}
	return cfg.deployContainer(ctx, imageRef, slug, envMap)
}

// isNodeProject reports whether the build directory contains a package.json.
func isNodeProject(dir string) bool {
	_, err := os.Stat(filepath.Join(dir, "package.json"))
	return err == nil
}

// pinsNodeVersion reports whether the project declares a Node version via
// package.json "engines.node" or a .nvmrc file.
func pinsNodeVersion(dir string) bool {
	if _, err := os.Stat(filepath.Join(dir, ".nvmrc")); err == nil {
		return true
	}
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return false
	}
	var pkg struct {
		Engines struct {
			Node string `json:"node"`
		} `json:"engines"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return false
	}
	return strings.TrimSpace(pkg.Engines.Node) != ""
}

// deployContainer starts a NEW container from imageRef under a unique name,
// waits for it to become healthy, and only then removes the project's previous
// container(s) — so a failed deploy never takes down the running version
// (zero-downtime). Both containers carry identical Traefik router/service labels,
// so Traefik load-balances across them during the brief overlap.
func (cfg Config) deployContainer(ctx context.Context, imageRef, slug string, envMap map[string]string) (string, error) {
	id := cfg.ProjectID
	domain := cfg.Domain
	port := fmt.Sprintf("%d", cfg.Port)
	traefikNet := cfg.resolveTraefikNetwork(ctx)
	if traefikNet == "" {
		return "", fmt.Errorf("TRAEFIK_NETWORK is not configured and no Traefik Docker network could be detected")
	}

	newName := fmt.Sprintf("pn-%s-%d", slug, time.Now().Unix())
	args := []string{"run", "-d", "--name", newName, "--restart", "unless-stopped"}
	args = append(args, "--network", traefikNet)
	args = append(args,
		"--label", "traefik.enable=true",
		"--label", fmt.Sprintf("pulsenode.project=%s", id),
		"--label", fmt.Sprintf("traefik.http.routers.pn-%s.rule=Host(`%s`)", id, domain),
		"--label", fmt.Sprintf("traefik.http.routers.pn-%s.entrypoints=websecure", id),
		"--label", fmt.Sprintf("traefik.http.routers.pn-%s.tls.certresolver=letsencrypt", id),
		"--label", fmt.Sprintf("traefik.http.services.pn-%s.loadbalancer.server.port=%s", id, port),
		"--label", fmt.Sprintf("traefik.docker.network=%s", traefikNet),
	)

	if _, ok := envMap["PORT"]; !ok {
		args = append(args, "-e", "PORT="+port)
	}
	for k, v := range envMap {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}
	args = append(args, imageRef)

	cfg.log("system", "→ Starting new container…")
	out, err := runOutput(ctx, "", "docker", args...)
	if err != nil {
		_ = runSilent(ctx, "docker", "rm", "-f", newName)
		return "", fmt.Errorf("docker run: %w", err)
	}
	cid := strings.TrimSpace(out)
	if len(cid) > 12 {
		cid = cid[:12]
	}

	// Health gate — keep the old version serving until the new one is proven healthy.
	cfg.log("system", "→ Waiting for the new container to become healthy…")
	if err := cfg.waitHealthy(ctx, newName); err != nil {
		cfg.log("system", "✕ New container failed its health check — keeping the previous version running")
		_ = runSilent(ctx, "docker", "rm", "-f", newName)
		return "", fmt.Errorf("health check failed: %w", err)
	}
	cfg.log("system", "✓ New container is healthy — switching traffic over")

	cfg.removeOldContainers(ctx, id, cid)
	return cid, nil
}

// removeOldContainers removes every container for this project except keepID:
// the new-style ones (matched by the pulsenode.project label) and the previous
// container recorded by the caller (covers containers from the old naming scheme
// that predate the label).
func (cfg Config) removeOldContainers(ctx context.Context, projectID, keepID string) {
	seen := map[string]bool{keepID: true}
	out, _ := runOutput(ctx, "", "docker", "ps", "-aq", "--filter", "label=pulsenode.project="+projectID)
	for _, oldID := range strings.Fields(out) {
		if seen[oldID] || strings.HasPrefix(keepID, oldID) || strings.HasPrefix(oldID, keepID) {
			continue
		}
		seen[oldID] = true
		_ = runSilent(ctx, "docker", "rm", "-f", oldID)
	}
	if prev := strings.TrimSpace(cfg.PrevContainerID); prev != "" && !seen[prev] &&
		!strings.HasPrefix(keepID, prev) && !strings.HasPrefix(prev, keepID) {
		_ = runSilent(ctx, "docker", "rm", "-f", prev)
	}
}

// waitHealthy blocks until the container reports healthy, fails, or healthTimeout
// elapses. If the image defines a HEALTHCHECK its status is authoritative;
// otherwise the container is considered healthy once it has stayed up (not
// exited, not restarting) for stableWindow.
func (cfg Config) waitHealthy(ctx context.Context, name string) error {
	deadline := time.Now().Add(healthTimeout)
	var stableSince time.Time
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}
		st := inspectState(ctx, name)
		switch {
		case st.health == "healthy":
			return nil
		case st.health == "unhealthy":
			return fmt.Errorf("container reported unhealthy")
		case st.health != "": // "starting" — image healthcheck still running
			stableSince = time.Time{}
		case st.status == "exited" || st.status == "dead":
			return fmt.Errorf("container exited (code %d)", st.exitCode)
		case st.running && !st.restarting:
			if stableSince.IsZero() {
				stableSince = time.Now()
			}
			if time.Since(stableSince) >= stableWindow {
				return nil
			}
		default:
			stableSince = time.Time{}
		}
		time.Sleep(1500 * time.Millisecond)
	}
	return fmt.Errorf("timed out after %s", healthTimeout)
}

type containerState struct {
	running, restarting bool
	status              string
	exitCode            int
	health              string
}

func inspectState(ctx context.Context, name string) containerState {
	out, err := runOutput(ctx, "", "docker", "inspect", "-f",
		"{{.State.Running}}|{{.State.Restarting}}|{{.State.Status}}|{{.State.ExitCode}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}", name)
	var st containerState
	if err != nil {
		return st
	}
	parts := strings.SplitN(strings.TrimSpace(out), "|", 5)
	if len(parts) != 5 {
		return st
	}
	st.running = parts[0] == "true"
	st.restarting = parts[1] == "true"
	st.status = parts[2]
	fmt.Sscanf(parts[3], "%d", &st.exitCode)
	st.health = parts[4]
	return st
}

func (cfg Config) composeOverlay(net string) string {
	id := cfg.ProjectID
	domain := cfg.Domain
	port := fmt.Sprintf("%d", cfg.Port)
	return fmt.Sprintf(`services:
  app:
    labels:
      traefik.enable: "true"
      traefik.http.routers.pn-%s.rule: "Host(`+"`%s`"+`)"
      traefik.http.routers.pn-%s.entrypoints: "websecure"
      traefik.http.routers.pn-%s.tls.certresolver: "letsencrypt"
      traefik.http.services.pn-%s.loadbalancer.server.port: "%s"
      traefik.docker.network: "%s"
    environment:
      PORT: "%s"
    networks:
      - default
      - traefik-net
networks:
  traefik-net:
    external: true
    name: %s
`, id, domain, id, id, id, port, net, port, net)
}

func (cfg Config) resolveTraefikNetwork(ctx context.Context) string {
	if net := strings.TrimSpace(cfg.TraefikNet); net != "" {
		return net
	}

	workspace := os.Getenv("PULSENODE_WORKSPACE")
	if workspace == "" {
		workspace = "/workspace"
	}
	if net := envFileValue(filepath.Join(workspace, ".env.local"), "TRAEFIK_NETWORK"); net != "" {
		cfg.log("system", fmt.Sprintf("→ Using Traefik network from .env.local: %s", net))
		return net
	}

	net := detectTraefikNetwork(ctx)
	if net != "" {
		cfg.log("system", fmt.Sprintf("→ Detected Traefik network: %s", net))
	}
	return net
}

func envFileValue(path, key string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return ""
	}
	prefix := key + "="
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") || !strings.HasPrefix(line, prefix) {
			continue
		}
		return strings.Trim(strings.TrimSpace(strings.TrimPrefix(line, prefix)), "\"")
	}
	return ""
}

func detectTraefikNetwork(ctx context.Context) string {
	out, err := runOutput(ctx, "", "docker", "ps", "--filter", "name=traefik", "--format", "{{.ID}}")
	if err != nil {
		return ""
	}
	for _, id := range strings.Fields(out) {
		data, err := runOutput(ctx, "", "docker", "inspect", id, "--format", "{{json .NetworkSettings.Networks}}")
		if err != nil {
			continue
		}
		var networks map[string]any
		if err := json.Unmarshal([]byte(data), &networks); err != nil {
			continue
		}
		for net := range networks {
			if net != "bridge" && net != "host" && net != "none" {
				return net
			}
		}
	}
	return ""
}

// ── helpers ───────────────────────────────────────────────────────────────────

func (cfg Config) run(ctx context.Context, dir string, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	stdout, _ := cmd.StdoutPipe()
	stderr, _ := cmd.StderrPipe()
	if err := cmd.Start(); err != nil {
		return err
	}
	streamLines := func(r io.Reader, stream string) {
		sc := bufio.NewScanner(r)
		for sc.Scan() {
			cfg.log(stream, sc.Text())
		}
	}
	go streamLines(stdout, "stdout")
	go streamLines(stderr, "stderr")
	return cmd.Wait()
}

func runOutput(ctx context.Context, dir string, name string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, name, args...)
	cmd.Dir = dir
	out, err := cmd.Output()
	return string(out), err
}

func runSilent(ctx context.Context, name string, args ...string) error {
	return exec.CommandContext(ctx, name, args...).Run()
}

func (cfg Config) log(stream, line string) {
	if cfg.Log != nil {
		cfg.Log(stream, line)
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// sanitizeName lowercases and replaces non-alphanumeric chars with hyphens.
func sanitizeName(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(name) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' {
			b.WriteRune(r)
		} else {
			b.WriteRune('-')
		}
	}
	s := strings.Trim(b.String(), "-")
	if s == "" {
		return "app"
	}
	return s
}

// CommitInfo returns the full SHA and subject line from the cloned repo.
func CommitInfo(dir string) (sha, msg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	sha, _ = runOutput(ctx, dir, "git", "rev-parse", "HEAD")
	msg, _ = runOutput(ctx, dir, "git", "log", "-1", "--pretty=%s")
	return strings.TrimSpace(sha), strings.TrimSpace(msg)
}
