package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"pulsenode/backend/internal/db"
)

func (s *Server) freePort(w http.ResponseWriter, r *http.Request) {
	projects, err := s.db.ListProjects()
	if err != nil {
		writeError(w, err)
		return
	}
	used := map[int]bool{}
	for _, p := range projects {
		used[p.Port] = true
	}
	port := 3000
	for used[port] {
		port++
	}
	writeJSON(w, http.StatusOK, map[string]int{"port": port})
}

func (s *Server) listProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := s.db.ListProjects()
	if err != nil {
		writeError(w, err)
		return
	}
	if projects == nil {
		projects = []db.Project{}
	}
	writeJSON(w, http.StatusOK, projects)
}

func (s *Server) createProject(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name         string `json:"name"`
		RepoURL      string `json:"repoUrl"`
		Branch       string `json:"branch"`
		BuildMethod  string `json:"buildMethod"`
		BuildCommand string `json:"buildCommand"`
		Port         int    `json:"port"`
		Domain       string `json:"domain"`
		EnvVars      string `json:"envVars"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if body.Name == "" || body.RepoURL == "" || body.Domain == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name, repoUrl, and domain are required"})
		return
	}
	if body.Branch == "" {
		body.Branch = "main"
	}
	if body.BuildMethod == "" {
		body.BuildMethod = "auto"
	}
	if body.Port == 0 {
		body.Port = 3000
	}
	if body.EnvVars == "" {
		body.EnvVars = "{}"
	}

	proj := &db.Project{
		ID:           db.NewID("proj"),
		Name:         body.Name,
		RepoURL:      body.RepoURL,
		Branch:       body.Branch,
		BuildMethod:  body.BuildMethod,
		BuildCommand: body.BuildCommand,
		Port:         body.Port,
		Domain:       body.Domain,
		EnvVars:      body.EnvVars,
		Status:       "idle",
	}
	if err := s.db.CreateProject(proj); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, proj)
}

func (s *Server) getProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	proj, err := s.db.GetProject(id)
	if err != nil {
		writeError(w, err)
		return
	}
	if proj == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	writeJSON(w, http.StatusOK, proj)
}

func (s *Server) updateProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Name         string `json:"name"`
		Branch       string `json:"branch"`
		BuildMethod  string `json:"buildMethod"`
		BuildCommand string `json:"buildCommand"`
		Port         int    `json:"port"`
		Domain       string `json:"domain"`
		EnvVars      string `json:"envVars"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if err := s.db.UpdateProject(id, body.Name, body.Branch, body.BuildMethod, body.BuildCommand, body.Port, body.Domain, body.EnvVars); err != nil {
		writeError(w, err)
		return
	}
	proj, _ := s.db.GetProject(id)
	writeJSON(w, http.StatusOK, proj)
}

func (s *Server) deleteProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.db.DeleteProject(id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) deployProject(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	proj, err := s.db.GetProject(id)
	if err != nil || proj == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "project not found"})
		return
	}

	dep := &db.Deployment{
		ID:        db.NewID("dep"),
		ProjectID: id,
		Status:    "queued",
		Trigger:   "manual",
	}
	if err := s.db.CreateDeployment(dep); err != nil {
		writeError(w, err)
		return
	}

	_ = s.db.UpdateProjectStatus(id, "building", "")
	s.queue.Enqueue(dep.ID)

	writeJSON(w, http.StatusAccepted, map[string]string{"deploymentId": dep.ID})
}

func (s *Server) listDeployments(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	deps, err := s.db.ListDeployments(id)
	if err != nil {
		writeError(w, err)
		return
	}
	if deps == nil {
		deps = []db.Deployment{}
	}
	writeJSON(w, http.StatusOK, deps)
}

func (s *Server) getDeploymentLogs(w http.ResponseWriter, r *http.Request) {
	depID := chi.URLParam(r, "depID")

	if r.Header.Get("Accept") == "text/event-stream" {
		s.streamDeploymentLogs(w, r, depID)
		return
	}

	logs, err := s.db.GetLogs(depID)
	if err != nil {
		writeError(w, err)
		return
	}
	if logs == nil {
		logs = []map[string]string{}
	}
	writeJSON(w, http.StatusOK, logs)
}

func (s *Server) streamDeploymentLogs(w http.ResponseWriter, r *http.Request, depID string) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	sendJSON := func(data any) {
		b, _ := json.Marshal(data)
		_, _ = fmt.Fprintf(w, "data: %s\n\n", b)
		if ok {
			flusher.Flush()
		}
	}

	// Send historical logs first
	logs, _ := s.db.GetLogs(depID)
	for _, entry := range logs {
		sendJSON(entry)
	}

	// Subscribe for live events
	ch := s.hub.Subscribe()
	defer s.hub.Unsubscribe(ch)

	ticker := time.NewTicker(20 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			_, _ = fmt.Fprint(w, ": ping\n\n")
			if ok {
				flusher.Flush()
			}
		case event, open := <-ch:
			if !open {
				return
			}
			if event.Type != "deploy:log" {
				continue
			}
			payload, isMap := event.Data.(map[string]any)
			if !isMap {
				continue
			}
			if payload["deploymentId"] != depID {
				continue
			}
			sendJSON(payload)
		}
	}
}

