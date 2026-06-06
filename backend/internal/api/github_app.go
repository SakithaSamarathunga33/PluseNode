package api

import (
	"net/http"
	"os"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"pulsenode/backend/internal/db"
	"pulsenode/backend/internal/github"
)

// ── App settings ──────────────────────────────────────────────────────────────

func (s *Server) githubAppSettings(w http.ResponseWriter, r *http.Request) {
	appID, _ := s.db.GetSetting("github_app_id")
	pkPEM, _ := s.db.GetSetting("github_app_private_key")
	slug, _ := s.db.GetSetting("github_app_slug")
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": appID != "" && pkPEM != "",
		"appId":      appID,
		"slug":       slug,
		"hasKey":     pkPEM != "",
	})
}

func (s *Server) githubAppSaveSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AppID         string `json:"appId"`
		Slug          string `json:"slug"`
		PrivateKey    string `json:"privateKey"`
		WebhookSecret string `json:"webhookSecret"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if body.AppID == "" || body.Slug == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "appId and slug are required"})
		return
	}
	if body.PrivateKey != "" {
		if _, err := github.ParseRSAPrivateKey(body.PrivateKey); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid private key: " + err.Error()})
			return
		}
		_ = s.db.SetSetting("github_app_private_key", body.PrivateKey)
	}
	if body.WebhookSecret != "" {
		_ = s.db.SetSetting("github_app_webhook_secret", body.WebhookSecret)
	}
	_ = s.db.SetSetting("github_app_id", body.AppID)
	_ = s.db.SetSetting("github_app_slug", body.Slug)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Install URL ───────────────────────────────────────────────────────────────

func (s *Server) githubAppInstallURL(w http.ResponseWriter, r *http.Request) {
	slug, _ := s.db.GetSetting("github_app_slug")
	if slug == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "GitHub App not configured (missing slug)"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"url": "https://github.com/apps/" + slug + "/installations/new",
	})
}

// githubAppCallback is the public endpoint GitHub redirects to after a user
// installs, updates, or removes the app. It stores/removes the installation
// and redirects the browser back to the GitHub settings page.
func (s *Server) githubAppCallback(w http.ResponseWriter, r *http.Request) {
	origin := strings.TrimRight(os.Getenv("NEXT_PUBLIC_ORIGIN"), "/")
	action := r.URL.Query().Get("setup_action")
	rawID := r.URL.Query().Get("installation_id")

	if action == "delete" {
		if id, err := strconv.ParseInt(rawID, 10, 64); err == nil && id != 0 {
			_ = s.db.DeleteAppInstallationByInstallID(id)
		}
		http.Redirect(w, r, origin+"/github?app_uninstalled=1", http.StatusFound)
		return
	}

	installationID, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || installationID == 0 {
		http.Redirect(w, r, origin+"/github?app_error=missing_id", http.StatusFound)
		return
	}

	appID, _ := s.db.GetSetting("github_app_id")
	pkPEM, _ := s.db.GetSetting("github_app_private_key")
	if appID == "" || pkPEM == "" {
		http.Redirect(w, r, origin+"/github?app_error=not_configured", http.StatusFound)
		return
	}

	appClient, err := github.NewAppClient(appID, pkPEM)
	if err != nil {
		http.Redirect(w, r, origin+"/github?app_error=key_error", http.StatusFound)
		return
	}
	inst, err := appClient.GetInstallation(installationID)
	if err != nil {
		http.Redirect(w, r, origin+"/github?app_error=api_error", http.StatusFound)
		return
	}
	if err := s.db.UpsertAppInstallation(inst.ID, inst.Account.Login, inst.Account.Type); err != nil {
		http.Redirect(w, r, origin+"/github?app_error=db_error", http.StatusFound)
		return
	}
	http.Redirect(w, r, origin+"/github?app_installed=1", http.StatusFound)
}

// githubAppRegister is a JSON endpoint called by the frontend callback page
// after GitHub redirects the user to /github/app/callback. Unlike
// githubAppCallback (which does a server-side redirect), this returns JSON so
// the Next.js page can show a status message and then navigate programmatically.
func (s *Server) githubAppRegister(w http.ResponseWriter, r *http.Request) {
	action := r.URL.Query().Get("setup_action")
	rawID := r.URL.Query().Get("installation_id")

	if action == "delete" {
		if id, err := strconv.ParseInt(rawID, 10, 64); err == nil && id != 0 {
			_ = s.db.DeleteAppInstallationByInstallID(id)
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "action": "deleted"})
		return
	}

	installationID, err := strconv.ParseInt(rawID, 10, 64)
	if err != nil || installationID == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing installation_id"})
		return
	}

	appID, _ := s.db.GetSetting("github_app_id")
	pkPEM, _ := s.db.GetSetting("github_app_private_key")
	if appID == "" || pkPEM == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "GitHub App not configured"})
		return
	}

	appClient, err := github.NewAppClient(appID, pkPEM)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "key error: " + err.Error()})
		return
	}
	inst, err := appClient.GetInstallation(installationID)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "github api: " + err.Error()})
		return
	}
	if err := s.db.UpsertAppInstallation(inst.ID, inst.Account.Login, inst.Account.Type); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"accountLogin": inst.Account.Login,
		"accountType":  inst.Account.Type,
	})
}

// ── Installations CRUD ────────────────────────────────────────────────────────

func (s *Server) listAppInstallations(w http.ResponseWriter, r *http.Request) {
	insts, err := s.db.ListAppInstallations()
	if err != nil {
		writeError(w, err)
		return
	}
	if insts == nil {
		insts = []db.AppInstallation{}
	}
	writeJSON(w, http.StatusOK, insts)
}

func (s *Server) deleteAppInstallation(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	if err := s.db.DeleteAppInstallation(id); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// ── Repos via App installations ───────────────────────────────────────────────

// githubAppRepos aggregates repos across all stored installations using
// per-installation access tokens. Errors from individual installations are
// skipped so a single bad install doesn't break the full list.
func (s *Server) githubAppRepos(w http.ResponseWriter, r *http.Request) {
	appID, _ := s.db.GetSetting("github_app_id")
	pkPEM, _ := s.db.GetSetting("github_app_private_key")
	if appID == "" || pkPEM == "" {
		writeJSON(w, http.StatusOK, []github.Repo{})
		return
	}
	appClient, err := github.NewAppClient(appID, pkPEM)
	if err != nil {
		writeError(w, err)
		return
	}
	insts, err := s.db.ListAppInstallations()
	if err != nil {
		writeError(w, err)
		return
	}

	var repos []github.Repo
	for _, inst := range insts {
		tok, err := appClient.GetInstallationToken(inst.InstallationID)
		if err != nil {
			continue
		}
		rs, err := github.InstallationRepos(tok.Token)
		if err != nil {
			continue
		}
		repos = append(repos, rs...)
	}
	if repos == nil {
		repos = []github.Repo{}
	}
	writeJSON(w, http.StatusOK, repos)
}
