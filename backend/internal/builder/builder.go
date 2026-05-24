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
	RepoURL      string   // already authorised for private repos
	Branch       string
	Method       Method   // auto | compose | dockerfile | nixpacks
	BuildCommand string   // optional override
	Port         int
	Domain       string
	EnvVars      string   // JSON {"KEY":"VALUE"}
	TraefikNet   string
	Log          LogFunc
}

// Run clones the repo, builds, and starts the container.
// Returns the container ID of the primary running container.
func Run(ctx context.Context, cfg Config) (containerID string, err error) {
	tmpDir, err := os.MkdirTemp("", "pn-build-*")
	if err != nil {
		return "", fmt.Errorf("mktemp: %w", err)
	}
	defer os.RemoveAll(tmpDir)

	cfg.log("system", "=== PulseNode Build Started ===")
	cfg.log("system", fmt.Sprintf("Repo: %s  Branch: %s", cfg.RepoURL, cfg.Branch))

	// 1. Clone
	cfg.log("system", "→ Cloning repository…")
	if err := cfg.run(ctx, tmpDir, "git", "clone", "--depth", "1", "--branch", cfg.Branch, cfg.RepoURL, "."); err != nil {
		return "", fmt.Errorf("clone: %w", err)
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
	imageName := fmt.Sprintf("pn-%s", slug)
	containerName := fmt.Sprintf("pn-%s", slug)

	// 4. Build & run
	switch method {
	case MethodCompose:
		containerID, err = cfg.buildCompose(ctx, tmpDir, containerName, envMap)
	case MethodDockerfile:
		containerID, err = cfg.buildDockerfile(ctx, tmpDir, imageName, containerName, envMap)
	case MethodNixpacks:
		containerID, err = cfg.buildNixpacks(ctx, tmpDir, imageName, containerName, envMap)
	default:
		return "", fmt.Errorf("unknown build method: %s", method)
	}
	if err != nil {
		return "", err
	}

	cfg.log("system", fmt.Sprintf("✓ Container running: %s", containerID[:12]))
	cfg.log("system", fmt.Sprintf("✓ Live at https://%s", cfg.Domain))
	return containerID, nil
}

func (cfg Config) buildCompose(ctx context.Context, dir, containerName string, envMap map[string]string) (string, error) {
	// Write overlay with Traefik labels for the first service
	cfg.log("system", "→ Writing Traefik labels overlay…")
	overlay := cfg.composeOverlay()
	if err := os.WriteFile(filepath.Join(dir, "docker-compose.pulsenode.yml"), []byte(overlay), 0o644); err != nil {
		return "", err
	}

	// Write .env for compose
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

func (cfg Config) buildDockerfile(ctx context.Context, dir, imageName, containerName string, envMap map[string]string) (string, error) {
	cfg.log("system", "→ Building Docker image…")
	if err := cfg.run(ctx, dir, "docker", "build", "-t", imageName, "."); err != nil {
		return "", fmt.Errorf("docker build: %w", err)
	}
	return cfg.runContainer(ctx, imageName, containerName, envMap)
}

func (cfg Config) buildNixpacks(ctx context.Context, dir, imageName, containerName string, envMap map[string]string) (string, error) {
	cfg.log("system", "→ Building with Nixpacks (this may take a few minutes)…")
	if err := cfg.run(ctx, dir, "docker", "run", "--rm",
		"-v", dir+":/app",
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"ghcr.io/railwayapp/nixpacks",
		"nixpacks", "build", "/app", "--name", imageName); err != nil {
		return "", fmt.Errorf("nixpacks build: %w", err)
	}
	return cfg.runContainer(ctx, imageName, containerName, envMap)
}

func (cfg Config) runContainer(ctx context.Context, imageName, containerName string, envMap map[string]string) (string, error) {
	// Stop and remove existing container with the same name
	_ = runSilent(ctx, "docker", "rm", "-f", containerName)

	args := []string{"run", "-d", "--name", containerName, "--restart", "unless-stopped"}

	// Traefik labels
	id := cfg.ProjectID
	domain := cfg.Domain
	port := fmt.Sprintf("%d", cfg.Port)
	if cfg.TraefikNet != "" {
		args = append(args, "--network", cfg.TraefikNet)
	}
	args = append(args,
		"--label", "traefik.enable=true",
		"--label", fmt.Sprintf("traefik.http.routers.pn-%s.rule=Host(`%s`)", id, domain),
		"--label", fmt.Sprintf("traefik.http.routers.pn-%s.entrypoints=websecure", id),
		"--label", fmt.Sprintf("traefik.http.routers.pn-%s.tls.certresolver=letsencrypt", id),
		"--label", fmt.Sprintf("traefik.http.services.pn-%s.loadbalancer.server.port=%s", id, port),
	)
	if cfg.TraefikNet != "" {
		args = append(args, "--label", fmt.Sprintf("traefik.docker.network=%s", cfg.TraefikNet))
	}

	// Env vars
	for k, v := range envMap {
		args = append(args, "-e", fmt.Sprintf("%s=%s", k, v))
	}

	args = append(args, imageName)

	cfg.log("system", "→ Starting container…")
	out, err := runOutput(ctx, "", "docker", args...)
	if err != nil {
		return "", fmt.Errorf("docker run: %w", err)
	}
	cid := strings.TrimSpace(out)
	if len(cid) > 12 {
		cid = cid[:12]
	}
	return cid, nil
}

func (cfg Config) composeOverlay() string {
	id := cfg.ProjectID
	domain := cfg.Domain
	port := fmt.Sprintf("%d", cfg.Port)
	net := cfg.TraefikNet
	if net == "" {
		net = "traefik"
	}
	return fmt.Sprintf(`services:
  app:
    labels:
      traefik.enable: "true"
      traefik.http.routers.pn-%s.rule: "Host(` + "`%s`" + `)"
      traefik.http.routers.pn-%s.entrypoints: "websecure"
      traefik.http.routers.pn-%s.tls.certresolver: "letsencrypt"
      traefik.http.services.pn-%s.loadbalancer.server.port: "%s"
      traefik.docker.network: "%s"
    networks:
      - default
      - traefik-net
networks:
  traefik-net:
    external: true
    name: %s
`, id, domain, id, id, id, port, net, net)
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

// CommitInfo returns short SHA and message from the cloned repo.
func CommitInfo(dir string) (sha, msg string) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	sha, _ = runOutput(ctx, dir, "git", "rev-parse", "--short", "HEAD")
	msg, _ = runOutput(ctx, dir, "git", "log", "-1", "--pretty=%s")
	return strings.TrimSpace(sha), strings.TrimSpace(msg)
}
