package api

import (
	"io"
	"net/http"
	"os"
	"time"
)

func (s *Server) coolifyProjects(w http.ResponseWriter, r *http.Request) {
	coolifyProxy(w, "/api/v1/projects")
}

func (s *Server) coolifyDeployments(w http.ResponseWriter, r *http.Request) {
	coolifyProxy(w, "/api/v1/deployments")
}

func coolifyProxy(w http.ResponseWriter, path string) {
	apiURL := os.Getenv("COOLIFY_API_URL")
	token := os.Getenv("COOLIFY_API_TOKEN")
	if apiURL == "" || token == "" {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest(http.MethodGet, apiURL+path, nil)
	if err != nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		writeJSON(w, http.StatusOK, []any{})
		return
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil || resp.StatusCode >= 300 {
		writeJSON(w, http.StatusOK, []any{})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(body) //nolint:errcheck
}
