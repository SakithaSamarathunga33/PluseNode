package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func (s *Server) caddyConfig(w http.ResponseWriter, r *http.Request) {
	cfg, err := s.caddy.Config(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, cfg)
}

func (s *Server) caddyRoutes(w http.ResponseWriter, r *http.Request) {
	routes, err := s.caddy.ListRoutes(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, routes)
}

func (s *Server) caddyAddRoute(w http.ResponseWriter, r *http.Request) {
	var req struct {
		ID       string `json:"id"`
		Domain   string `json:"domain"`
		Upstream string `json:"upstream"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if req.Domain == "" || req.Upstream == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "domain and upstream are required"})
		return
	}
	if err := s.caddy.UpsertRoute(r.Context(), req.ID, req.Domain, req.Upstream); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) caddyRemoveRoute(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.caddy.RemoveRoute(r.Context(), id); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}
