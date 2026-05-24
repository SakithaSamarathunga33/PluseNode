package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	dbpkg "pulsenode/backend/internal/db"
)

// ── Alert rules ────────────────────────────────────────────────────────────────

func (s *Server) listAlertRules(w http.ResponseWriter, r *http.Request) {
	rules, err := s.db.ListAlertRules()
	if err != nil {
		writeError(w, err)
		return
	}
	if rules == nil {
		rules = []dbpkg.AlertRule{}
	}
	writeJSON(w, http.StatusOK, rules)
}

func (s *Server) createAlertRule(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name      string  `json:"name"`
		Metric    string  `json:"metric"`
		Operator  string  `json:"operator"`
		Threshold float64 `json:"threshold"`
		Duration  int     `json:"duration"`
		Severity  string  `json:"severity"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if req.Name == "" || req.Metric == "" || req.Operator == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name, metric, and operator are required"})
		return
	}
	if req.Severity == "" {
		req.Severity = "warning"
	}
	rule := &dbpkg.AlertRule{
		ID:        dbpkg.NewID("rule"),
		Name:      req.Name,
		Metric:    req.Metric,
		Operator:  req.Operator,
		Threshold: req.Threshold,
		Duration:  req.Duration,
		Severity:  req.Severity,
		Enabled:   true,
	}
	if err := s.db.CreateAlertRule(rule); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, rule)
}

func (s *Server) updateAlertRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if err := s.db.UpdateAlertRule(id, req.Enabled); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (s *Server) deleteAlertRule(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.db.DeleteAlertRule(id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── Alert history ─────────────────────────────────────────────────────────────

func (s *Server) listAlertHistory(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 100
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}
	history, err := s.db.ListAlertHistory(limit)
	if err != nil {
		writeError(w, err)
		return
	}
	if history == nil {
		history = []dbpkg.AlertEvent{}
	}
	writeJSON(w, http.StatusOK, history)
}

// ── Notification channels ─────────────────────────────────────────────────────

func (s *Server) listNotificationChannels(w http.ResponseWriter, r *http.Request) {
	channels, err := s.db.ListNotificationChannels()
	if err != nil {
		writeError(w, err)
		return
	}
	if channels == nil {
		channels = []dbpkg.NotificationChannel{}
	}
	writeJSON(w, http.StatusOK, channels)
}

func (s *Server) createNotificationChannel(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name    string         `json:"name"`
		Type    string         `json:"type"`
		Config  map[string]any `json:"config"`
		Enabled bool           `json:"enabled"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	cfgBytes, _ := json.Marshal(req.Config)
	ch := &dbpkg.NotificationChannel{
		ID:      dbpkg.NewID("ch"),
		Name:    req.Name,
		Type:    req.Type,
		Config:  string(cfgBytes),
		Enabled: req.Enabled,
	}
	if err := s.db.CreateNotificationChannel(ch); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, ch)
}

func (s *Server) deleteNotificationChannel(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := s.db.DeleteNotificationChannel(id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── Audit log ─────────────────────────────────────────────────────────────────

func (s *Server) listAuditLog(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.Query(`SELECT id,actor,action,resource,ip,status,created_at FROM audit_log ORDER BY created_at DESC LIMIT 200`)
	if err != nil {
		writeError(w, err)
		return
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var id int64
		var actor, action, resource, ip string
		var status int
		var createdAt string
		if err := rows.Scan(&id, &actor, &action, &resource, &ip, &status, &createdAt); err != nil {
			continue
		}
		out = append(out, map[string]any{
			"id": id, "actor": actor, "action": action,
			"resource": resource, "ip": ip, "status": status, "created_at": createdAt,
		})
	}
	if out == nil {
		out = []map[string]any{}
	}
	writeJSON(w, http.StatusOK, out)
}
