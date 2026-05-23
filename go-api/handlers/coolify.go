package handlers

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"pulsenode/api/docker"
)

type CoolifyHandler struct{ dc *docker.Client }

func NewCoolifyHandler(dc *docker.Client) *CoolifyHandler { return &CoolifyHandler{dc: dc} }

func (h *CoolifyHandler) Projects(w http.ResponseWriter, r *http.Request) {
	projects, err := fetchCoolifyProjects(h.dc)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, projects)
}

func (h *CoolifyHandler) Deployments(w http.ResponseWriter, r *http.Request) {
	deps, err := fetchCoolifyDeployments()
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, deps)
}

func coolifyBase() string  { return os.Getenv("COOLIFY_API_URL") }
func coolifyToken() string { return os.Getenv("COOLIFY_API_TOKEN") }

func fetchCoolifyProjects(dc *docker.Client) ([]map[string]interface{}, error) {
	base := coolifyBase()
	token := coolifyToken()
	if base == "" || token == "" {
		return mockCoolifyProjects(dc), nil
	}
	client := &http.Client{Timeout: 8 * time.Second}
	req, _ := http.NewRequest(http.MethodGet, base+"/api/v1/projects", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return mockCoolifyProjects(dc), nil
	}
	defer resp.Body.Close()
	var projects []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&projects); err != nil {
		return mockCoolifyProjects(dc), nil
	}
	// Enrich with container labels from Docker
	if !dc.IsMock() {
		if ctrs, err := dc.ListContainers(false); err == nil {
			labelIndex := make(map[string]map[string]string)
			for _, c := range ctrs {
				if appID := c.Labels["coolify.applicationId"]; appID != "" {
					labelIndex[appID] = c.Labels
				}
			}
			// Annotate project apps with container state
			for i, p := range projects {
				if apps, ok := p["applications"].([]interface{}); ok {
					for j, a := range apps {
						if app, ok := a.(map[string]interface{}); ok {
							if id, ok := app["id"].(string); ok {
								if labels, ok := labelIndex[id]; ok {
									app["containerName"] = labels["com.docker.compose.service"]
									apps[j] = app
								}
							}
						}
					}
					projects[i]["applications"] = apps
				}
			}
		}
	}
	return projects, nil
}

func fetchCoolifyDeployments() ([]map[string]interface{}, error) {
	base := coolifyBase()
	token := coolifyToken()
	if base == "" || token == "" {
		return mockCoolifyDeployments(), nil
	}
	client := &http.Client{Timeout: 8 * time.Second}
	req, _ := http.NewRequest(http.MethodGet, base+"/api/v1/deployments", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	resp, err := client.Do(req)
	if err != nil {
		return mockCoolifyDeployments(), nil
	}
	defer resp.Body.Close()
	var deps []map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&deps); err != nil {
		return mockCoolifyDeployments(), nil
	}
	return deps, nil
}

func mockCoolifyProjects(dc *docker.Client) []map[string]interface{} {
	apps := []map[string]interface{}{}
	if !dc.IsMock() {
		if ctrs, err := dc.ListContainers(false); err == nil {
			for _, c := range ctrs {
				if appID := c.Labels["coolify.applicationId"]; appID != "" {
					name := strings.TrimPrefix(c.Names[0], "/")
					apps = append(apps, map[string]interface{}{
						"id":            appID,
						"name":          name,
						"status":        map[string]string{"running": "running", "exited": "stopped"}[c.State],
						"containerName": name,
					})
				}
			}
		}
	}
	if len(apps) == 0 {
		apps = []map[string]interface{}{
			{"id": "mock-app-1", "name": "web-frontend", "status": "running", "domains": []string{"example.com"}, "lastDeployed": "2025-05-01", "branch": "main"},
			{"id": "mock-app-2", "name": "api-server", "status": "running", "domains": []string{"api.example.com"}, "lastDeployed": "2025-05-02", "branch": "main"},
		}
	}
	return []map[string]interface{}{
		{
			"id":           "mock-project-1",
			"name":         "Production",
			"applications": apps,
			"databases":    []interface{}{},
			"services":     []interface{}{},
		},
	}
}

func mockCoolifyDeployments() []map[string]interface{} {
	return []map[string]interface{}{
		{"id": "dep-1", "appName": "web-frontend", "branch": "main", "status": "success", "duration": "1m 23s", "triggeredBy": "git push", "timestamp": fmt.Sprintf("%v", time.Now().Add(-2*time.Hour))},
		{"id": "dep-2", "appName": "api-server", "branch": "main", "status": "success", "duration": "0m 45s", "triggeredBy": "manual", "timestamp": fmt.Sprintf("%v", time.Now().Add(-5*time.Hour))},
	}
}
