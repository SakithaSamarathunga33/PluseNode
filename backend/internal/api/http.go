package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, err error) {
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}

// upsertEnvLocal writes or replaces KEY=VALUE in .env.local.
func upsertEnvLocal(key, value string) error {
	envFile := filepath.Join(workspaceDir(), ".env.local")
	existing := ""
	if data, err := os.ReadFile(envFile); err == nil {
		existing = string(data)
	}

	lines := strings.Split(existing, "\n")
	found := false
	for i, line := range lines {
		if strings.HasPrefix(line, key+"=") {
			lines[i] = fmt.Sprintf("%s=%s", key, value)
			found = true
			break
		}
	}
	if !found {
		lines = append(lines, fmt.Sprintf("%s=%s", key, value))
	}

	content := strings.Join(lines, "\n")
	if !strings.HasSuffix(content, "\n") {
		content += "\n"
	}
	return os.WriteFile(envFile, []byte(content), 0o600)
}
