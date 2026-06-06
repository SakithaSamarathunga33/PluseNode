package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"pulsenode/backend/internal/api"
	"pulsenode/backend/internal/db"
	"pulsenode/backend/internal/docker"
	"pulsenode/backend/internal/hub"
	"pulsenode/backend/internal/proc"
	"pulsenode/backend/internal/queue"
)

func main() {
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	if os.Getenv("LOG_FORMAT") != "json" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: "15:04:05"})
	}
	level := zerolog.InfoLevel
	if os.Getenv("LOG_LEVEL") == "debug" {
		level = zerolog.DebugLevel
	}
	zerolog.SetGlobalLevel(level)

	port := env("GO_PORT", "4002")

	dockerClient, err := docker.New()
	if err != nil {
		log.Warn().Err(err).Msg("docker socket unavailable, container features disabled")
	}

	database, err := db.Open(env("DATABASE_PATH", "/data/pulsenode.db"))
	if err != nil {
		log.Fatal().Err(err).Msg("failed to open database")
	}

	collector := proc.NewCollector(60, 3*time.Second)
	events := hub.New()
	jobQueue := queue.New(database, events, 2)
	jobQueue.RecoverStuck()

	server := api.NewServer(api.Config{
		Docker:    dockerClient,
		Collector: collector,
		Hub:       events,
		DB:        database,
		Queue:     jobQueue,
		Origins: []string{
			env("NEXT_PUBLIC_ORIGIN", "http://localhost:3000"),
			"http://localhost:3001",
			"http://127.0.0.1:3000",
		},
	})

	server.SeedDomainsIfEmpty(context.Background())
	server.SeedGitHubAppFromEnv()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go collector.Start(ctx)
	go streamSystemMetrics(ctx, collector, events)
	go streamContainerStats(ctx, dockerClient, events)
	go jobQueue.StartPoller(ctx, pollInterval())

	httpServer := &http.Server{
		Addr:              ":" + port,
		Handler:           server.Routes(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		log.Info().Str("addr", "http://localhost:"+port).Msg("PulseNode listening")
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal().Err(err).Msg("server error")
		}
	}()

	<-ctx.Done()
	log.Info().Msg("shutting down…")
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
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// pollInterval reads DEPLOY_POLL_INTERVAL (e.g. "60s", "2m"), defaulting to 60s.
func pollInterval() time.Duration {
	if v := os.Getenv("DEPLOY_POLL_INTERVAL"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return 60 * time.Second
}
