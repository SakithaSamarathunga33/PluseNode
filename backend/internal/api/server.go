package api

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"

	"pulsenode/backend/internal/auth"
	"pulsenode/backend/internal/docker"
	"pulsenode/backend/internal/hub"
	"pulsenode/backend/internal/proc"
	"pulsenode/backend/internal/security"
)

type Config struct {
	Docker    *docker.Client
	Collector *proc.Collector
	Hub       *hub.Hub
	Origins   []string
}

type Server struct {
	docker    *docker.Client
	collector *proc.Collector
	hub       *hub.Hub
	security  *security.Service
	auth      *auth.Middleware
	origins   []string
}

func NewServer(cfg Config) *Server {
	return &Server{
		docker:    cfg.Docker,
		collector: cfg.Collector,
		hub:       cfg.Hub,
		security:  security.New(),
		auth: auth.NewMiddleware(auth.Config{
			Enabled: strings.EqualFold(os.Getenv("GO_API_AUTH"), "true") || strings.EqualFold(os.Getenv("NODE_API_AUTH"), "true"),
			Secret:  firstNonEmpty(os.Getenv("JWT_SECRET"), os.Getenv("NODE_API_SECRET"), "pulsenode-dev-secret"),
		}),
		origins: cfg.Origins,
	}
}

func (s *Server) Routes() http.Handler {
	r := chi.NewRouter()
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.origins,
		AllowedMethods:   []string{"GET", "POST", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", s.health)
	r.Get("/events", s.hub.ServeSSE)
	r.Get("/ws", s.hub.ServeWebSocket)

	r.Route("/api", func(r chi.Router) {
		r.Use(s.auth.Require)
		r.Get("/docker/containers", s.dockerContainers)
		r.Get("/docker/images", s.dockerImages)
		r.Get("/docker/networks", s.dockerNetworks)
		r.Get("/docker/databases", s.dockerDatabases)
		r.Get("/docker/logs/{id}", s.dockerLogs)
		r.Post("/docker/restart/{id}", s.dockerAction("restart"))
		r.Post("/docker/start/{id}", s.dockerAction("start"))
		r.Post("/docker/stop/{id}", s.dockerAction("stop"))
		r.Delete("/docker/remove/{id}", s.dockerAction("remove"))
		r.Post("/docker/exec/{id}", s.dockerExec)
		r.Post("/docker/build-cache/clear", s.clearBuildCache)

		r.Get("/host", s.host)
		r.Get("/pm2/list", s.processes)
		r.Post("/pm2/restart/{name}", notImplemented)
		r.Post("/processes/kill/{pid}", signalHandler(os.Kill))
		r.Post("/processes/suspend/{pid}", signalHandler(syscall.SIGSTOP))
		r.Post("/processes/resume/{pid}", signalHandler(syscall.SIGCONT))

		r.Get("/system/version", s.version)
		r.Get("/system/update/status", s.updateStatus)
		r.Post("/system/update", notImplemented)

		r.Get("/coolify/projects", s.coolifyProjects)
		r.Get("/coolify/deployments", s.coolifyDeployments)

		r.Get("/database/custom", emptyList)
		r.Post("/database/custom/test", notImplemented)
		r.Post("/database/custom/save", notImplemented)
		r.Delete("/database/custom/{id}", notImplemented)
		r.Post("/database/provision", notImplemented)
		r.Get("/database/{name}/connection-string", notImplemented)
		r.Get("/database/{name}/schema", notImplemented)
		r.Get("/database/{name}/metrics", notImplemented)
		r.Get("/database/{name}/backup", notImplemented)
		r.Post("/database/{name}/query", notImplemented)
	})

	r.Get("/metrics/live", s.metricsLive)
	r.Get("/metrics/history", s.metricsHistory)
	r.Get("/metrics/processes", s.processes)

	r.Get("/security/scans", s.securityScans)
	r.Post("/security/scan", s.securityScan)
	r.Get("/security/sboms", s.securitySBOMs)
	r.Post("/security/sbom", s.securitySBOM)

	r.Get("/database/inspect", emptyList)
	r.Get("/database/connections", emptyList)

	return r
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "service": "pulsenode-go", "ts": time.Now().UnixMilli()})
}

func (s *Server) version(w http.ResponseWriter, r *http.Request) {
	current := firstNonEmpty(os.Getenv("PULSENODE_VERSION"), "dev")
	writeJSON(w, http.StatusOK, map[string]any{"current": current, "latest": nil, "hasUpdate": false, "releaseUrl": nil, "changelog": nil})
}

func (s *Server) updateStatus(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"running": false, "log": []string{}, "error": nil, "startedAt": nil})
}

func notImplemented(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusNotImplemented, map[string]string{"error": "not implemented in Go backend yet"})
}

func emptyList(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, []any{})
}

func signalHandler(sig os.Signal) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		pid, err := strconv.Atoi(chi.URLParam(r, "pid"))
		if err != nil || pid < 2 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid pid"})
			return
		}
		if err := proc.Signal(pid, sig); err != nil {
			writeError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "pid": pid, "signal": sig.String()})
	}
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}
