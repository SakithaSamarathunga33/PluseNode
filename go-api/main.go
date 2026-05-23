package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"pulsenode/api/auth"
	"pulsenode/api/collector"
	"pulsenode/api/docker"
	"pulsenode/api/handlers"
	"pulsenode/api/hub"
)

func main() {
	port := os.Getenv("GO_PORT")
	if port == "" {
		port = "4001"
	}

	// ── Docker client ──────────────────────────────────────────────────────────
	dc := docker.NewClient()
	if err := dc.Ping(context.Background()); err != nil {
		log.Printf("[docker] unavailable: %v — running in mock mode", err)
		dc.SetMock(true)
	} else {
		log.Println("[docker] ✓ connected to Docker socket")
	}

	// ── Hub + collector ────────────────────────────────────────────────────────
	h := hub.New()
	col := collector.New(dc)
	go h.Run()
	go col.Run(h)

	// ── Alert checker (runs every 10 s) ────────────────────────────────────────
	go alertChecker(h, col)

	// ── Auth middleware ────────────────────────────────────────────────────────
	authMW := auth.New(os.Getenv("API_AUTH"), os.Getenv("API_SECRET"))

	// ── Handlers ───────────────────────────────────────────────────────────────
	sseH  := handlers.NewSSEHandler(h)
	ctrH  := handlers.NewContainerHandler(dc)
	hostH := handlers.NewHostHandler(dc)
	metH  := handlers.NewMetricsHandler(col)
	procH := handlers.NewProcessHandler()
	dbH   := handlers.NewDatabaseHandler(dc)
	coolH := handlers.NewCoolifyHandler(dc)
	secH  := handlers.NewSecurityHandler()
	sysH  := handlers.NewSystemHandler(dc)

	// ── Router ─────────────────────────────────────────────────────────────────
	mux := http.NewServeMux()

	// Health (no auth)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"ok":true,"ts":%d}`, time.Now().UnixMilli())
	})

	// SSE (no auth — browsers can't set headers on EventSource)
	mux.HandleFunc("GET /api/sse", sseH.Handle)

	// Docker containers
	mux.Handle("GET /api/docker/containers",         authMW(http.HandlerFunc(ctrH.List)))
	mux.Handle("GET /api/docker/images",             authMW(http.HandlerFunc(ctrH.Images)))
	mux.Handle("GET /api/docker/networks",           authMW(http.HandlerFunc(ctrH.Networks)))
	mux.Handle("GET /api/docker/databases",          authMW(http.HandlerFunc(ctrH.Databases)))
	mux.Handle("GET /api/docker/logs/{id}",          authMW(http.HandlerFunc(ctrH.Logs)))
	mux.Handle("POST /api/docker/restart/{id}",      authMW(http.HandlerFunc(ctrH.Restart)))
	mux.Handle("POST /api/docker/start/{id}",        authMW(http.HandlerFunc(ctrH.Start)))
	mux.Handle("POST /api/docker/stop/{id}",         authMW(http.HandlerFunc(ctrH.Stop)))
	mux.Handle("DELETE /api/docker/remove/{id}",     authMW(http.HandlerFunc(ctrH.Remove)))
	mux.Handle("POST /api/docker/exec/{id}",         authMW(http.HandlerFunc(ctrH.Exec)))
	mux.Handle("POST /api/docker/build-cache/clear", authMW(http.HandlerFunc(ctrH.ClearBuildCache)))

	// Host
	mux.Handle("GET /api/host", authMW(http.HandlerFunc(hostH.Handle)))

	// Metrics
	mux.Handle("GET /api/metrics/live",      authMW(http.HandlerFunc(metH.Live)))
	mux.Handle("GET /api/metrics/history",   authMW(http.HandlerFunc(metH.History)))
	mux.Handle("GET /api/metrics/processes", authMW(http.HandlerFunc(metH.Processes)))

	// Processes (signal routes)
	mux.Handle("POST /api/processes/kill/{pid}",    authMW(http.HandlerFunc(procH.Kill)))
	mux.Handle("POST /api/processes/suspend/{pid}", authMW(http.HandlerFunc(procH.Suspend)))
	mux.Handle("POST /api/processes/resume/{pid}",  authMW(http.HandlerFunc(procH.Resume)))

	// Databases — custom connections
	mux.Handle("GET /api/database/custom",         authMW(http.HandlerFunc(dbH.ListCustom)))
	mux.Handle("POST /api/database/custom/test",   authMW(http.HandlerFunc(dbH.TestCustom)))
	mux.Handle("POST /api/database/custom/save",   authMW(http.HandlerFunc(dbH.SaveCustom)))
	mux.Handle("DELETE /api/database/custom/{id}", authMW(http.HandlerFunc(dbH.DeleteCustom)))
	mux.Handle("POST /api/database/provision",     authMW(http.HandlerFunc(dbH.Provision)))
	// Databases — per-container routes (ordered most-specific first)
	mux.Handle("GET /api/database/{name}/connection-string", authMW(http.HandlerFunc(dbH.ConnectionString)))
	mux.Handle("GET /api/database/{name}/schema",            authMW(http.HandlerFunc(dbH.Schema)))
	mux.Handle("GET /api/database/{name}/metrics",           authMW(http.HandlerFunc(dbH.Metrics)))
	mux.Handle("GET /api/database/{name}/backup",            authMW(http.HandlerFunc(dbH.Backup)))
	mux.Handle("POST /api/database/{name}/query",            authMW(http.HandlerFunc(dbH.Query)))
	// Database inspect (was Python /database/inspect)
	mux.Handle("GET /api/database/inspect",     authMW(http.HandlerFunc(dbH.Inspect)))
	mux.Handle("GET /api/database/connections", authMW(http.HandlerFunc(dbH.Connections)))

	// Coolify
	mux.Handle("GET /api/coolify/projects",    authMW(http.HandlerFunc(coolH.Projects)))
	mux.Handle("GET /api/coolify/deployments", authMW(http.HandlerFunc(coolH.Deployments)))

	// Security
	mux.Handle("GET /api/security/scans",  authMW(http.HandlerFunc(secH.Scans)))
	mux.Handle("POST /api/security/scan",  authMW(http.HandlerFunc(secH.Scan)))
	mux.Handle("GET /api/security/sboms",  authMW(http.HandlerFunc(secH.SBOMs)))
	mux.Handle("POST /api/security/sbom",  authMW(http.HandlerFunc(secH.SBOM)))

	// System
	mux.Handle("GET /api/system/version",       authMW(http.HandlerFunc(sysH.Version)))
	mux.Handle("GET /api/system/update/status", authMW(http.HandlerFunc(sysH.UpdateStatus)))
	mux.Handle("POST /api/system/update",       authMW(http.HandlerFunc(sysH.Update)))

	// ── CORS + server ──────────────────────────────────────────────────────────
	origin := os.Getenv("NEXT_PUBLIC_ORIGIN")
	if origin == "" {
		origin = "http://localhost:3000"
	}
	handler := corsMiddleware([]string{origin, "http://localhost:3001"}, mux)

	log.Printf("[server] ✓ PulseNode Go API running on :%s", port)
	if err := http.ListenAndServe(":"+port, handler); err != nil {
		log.Fatal(err)
	}
}

// ── CORS middleware ────────────────────────────────────────────────────────────

func corsMiddleware(origins []string, next http.Handler) http.Handler {
	allowed := make(map[string]bool, len(origins))
	for _, o := range origins {
		allowed[o] = true
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if allowed[origin] {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── Alert checker ─────────────────────────────────────────────────────────────

var alertCount int

func alertChecker(h *hub.Hub, col *collector.Collector) {
	cpuWindow := make([]float64, 0, 30)
	ticker := time.NewTicker(10 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		if h.Count() == 0 {
			continue
		}
		m := col.GetLatest()
		cpuWindow = append(cpuWindow, m.CPU)
		if len(cpuWindow) > 30 {
			cpuWindow = cpuWindow[1:]
		}
		// CPU sustained > 85% for last 3 samples
		if len(cpuWindow) >= 3 {
			last3 := cpuWindow[len(cpuWindow)-3:]
			if last3[0] > 85 && last3[1] > 85 && last3[2] > 85 {
				pushAlert(h, "warn",
					fmt.Sprintf("CPU sustained above 85%% (%.1f%%)", m.CPU),
					"host.cpu > 85% for 30s")
			}
		}
		// RAM > 90%
		if m.RAM > 90 {
			pushAlert(h, "warn",
				fmt.Sprintf("RAM above 90%% (%.1f%%)", m.RAM),
				"host.mem > 90%")
		}
	}
}

func pushAlert(h *hub.Hub, sev, title, rule string) {
	alertCount++
	alert := map[string]interface{}{
		"id":     fmt.Sprintf("alert-%d", time.Now().UnixMilli()),
		"sev":    sev,
		"title":  title,
		"target": "production-01",
		"time":   time.Now().UTC().Format(time.RFC3339),
		"rule":   rule,
		"state":  "firing",
		"read":   false,
	}
	data, _ := json.Marshal(alert)
	h.Broadcast(hub.Message{Event: "alert_new", Data: data})
	countData, _ := json.Marshal(alertCount)
	h.Broadcast(hub.Message{Event: "alert_count", Data: countData})
}

var _ = strings.TrimSpace
