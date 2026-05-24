package api

import (
	"net/http"
	"os"
	"syscall"
)

func (s *Server) metricsLive(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.collector.Live())
}

func (s *Server) metricsHistory(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.collector.History())
}

func (s *Server) processes(w http.ResponseWriter, r *http.Request) {
	items, err := s.collector.Processes()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, items)
}

func (s *Server) containerStats(w http.ResponseWriter, r *http.Request) {
	if s.docker == nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	stats, err := s.docker.ContainerStatsNamed(r.Context())
	if err != nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) host(w http.ResponseWriter, r *http.Request) {
	running := 0
	if s.docker != nil {
		if containers, err := s.docker.Containers(r.Context()); err == nil {
			for _, container := range containers {
				if container.State == "running" {
					running++
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, s.collector.Host(running))
}

func init() {
	_ = os.Kill
	_ = syscall.SIGSTOP
}
