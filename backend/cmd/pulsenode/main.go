package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"pulsenode/backend/internal/api"
	"pulsenode/backend/internal/docker"
	"pulsenode/backend/internal/hub"
	"pulsenode/backend/internal/proc"
)

func main() {
	port := env("GO_PORT", "4002")

	dockerClient, err := docker.New()
	if err != nil {
		log.Printf("[docker] unavailable, using mock-compatible empty responses: %v", err)
	}

	collector := proc.NewCollector(60, 3*time.Second)
	events := hub.New()
	server := api.NewServer(api.Config{
		Docker:    dockerClient,
		Collector: collector,
		Hub:       events,
		Origins: []string{
			env("NEXT_PUBLIC_ORIGIN", "http://localhost:3000"),
			"http://localhost:3001",
			"http://127.0.0.1:3000",
		},
	})

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go collector.Start(ctx)
	go streamSystemMetrics(ctx, collector, events)
	go streamContainerStats(ctx, dockerClient, events)

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Printf("[server] PulseNode Go backend listening on http://localhost:%s", port)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[server] listen failed: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(shutdownCtx)
}

func streamSystemMetrics(ctx context.Context, collector *proc.Collector, events *hub.Hub) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			events.Broadcast("system:metrics", collector.Live())
		}
	}
}

func streamContainerStats(ctx context.Context, dockerClient *docker.Client, events *hub.Hub) {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if dockerClient == nil {
				continue
			}
			stats, err := dockerClient.ContainerStats(ctx)
			if err == nil {
				events.Broadcast("container:stats", stats)
			}
		}
	}
}

func env(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func envBool(key string, fallback bool) bool {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

var _ = envBool
