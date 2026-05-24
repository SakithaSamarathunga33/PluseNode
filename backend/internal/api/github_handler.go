package api

import (
	"net/http"
	"os"
	"strings"

	"pulsenode/backend/internal/github"
)

func (s *Server) githubAuthURL(w http.ResponseWriter, r *http.Request) {
	origin := os.Getenv("NEXT_PUBLIC_ORIGIN")
	callback := origin + "/go/api/github/callback"
	writeJSON(w, http.StatusOK, map[string]string{"url": github.AuthURL(callback)})
}

func (s *Server) githubCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	if code == "" {
		http.Error(w, "missing code", http.StatusBadRequest)
		return
	}
	origin := os.Getenv("NEXT_PUBLIC_ORIGIN")
	callback := origin + "/go/api/github/callback"

	token, err := github.ExchangeCode(code, callback)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	client := github.NewClient(token)
	user, err := client.CurrentUser()
	if err != nil {
		http.Error(w, "failed to fetch user: "+err.Error(), http.StatusInternalServerError)
		return
	}

	if err := s.db.UpsertGitHubAccount(user.Login, user.AvatarURL, token, "oauth"); err != nil {
		http.Error(w, "failed to store account: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// Redirect back to the GitHub page in the frontend
	http.Redirect(w, r, origin+"/github?connected=1", http.StatusFound)
}

func (s *Server) githubAccount(w http.ResponseWriter, r *http.Request) {
	acct, err := s.db.GetGitHubAccount()
	if err != nil {
		writeError(w, err)
		return
	}
	if acct == nil {
		writeJSON(w, http.StatusOK, nil)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"login":     acct.Login,
		"avatarUrl": acct.AvatarURL,
		"tokenType": acct.TokenType,
	})
}

func (s *Server) githubDisconnect(w http.ResponseWriter, r *http.Request) {
	if err := s.db.DeleteGitHubAccount(); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) githubSavePAT(w http.ResponseWriter, r *http.Request) {
	var body struct{ Token string `json:"token"` }
	if err := decodeJSON(r, &body); err != nil || body.Token == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token required"})
		return
	}
	client := github.NewClient(body.Token)
	user, err := client.CurrentUser()
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid token: " + err.Error()})
		return
	}
	if err := s.db.UpsertGitHubAccount(user.Login, user.AvatarURL, body.Token, "pat"); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"login": user.Login, "avatarUrl": user.AvatarURL})
}

func (s *Server) githubRepos(w http.ResponseWriter, r *http.Request) {
	acct, err := s.db.GetGitHubAccount()
	if err != nil || acct == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "no GitHub account connected"})
		return
	}
	repos, err := github.NewClient(acct.AccessToken).ListRepos()
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, repos)
}

func (s *Server) githubBranches(w http.ResponseWriter, r *http.Request) {
	acct, err := s.db.GetGitHubAccount()
	if err != nil || acct == nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "no GitHub account connected"})
		return
	}
	// expect ?repo=owner/repo
	full := r.URL.Query().Get("repo")
	parts := strings.SplitN(full, "/", 2)
	if len(parts) != 2 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "repo must be owner/repo"})
		return
	}
	branches, err := github.NewClient(acct.AccessToken).ListBranches(parts[0], parts[1])
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, branches)
}

func (s *Server) githubSaveOAuthSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ClientID     string `json:"clientId"`
		ClientSecret string `json:"clientSecret"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	// Persist to .env.local (appended/replaced)
	if err := upsertEnvLocal("GITHUB_CLIENT_ID", body.ClientID); err != nil {
		writeError(w, err)
		return
	}
	if err := upsertEnvLocal("GITHUB_CLIENT_SECRET", body.ClientSecret); err != nil {
		writeError(w, err)
		return
	}
	// Also set in process env so OAuth works immediately without restart
	os.Setenv("GITHUB_CLIENT_ID", body.ClientID)
	os.Setenv("GITHUB_CLIENT_SECRET", body.ClientSecret)
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) githubOAuthSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"clientId":     os.Getenv("GITHUB_CLIENT_ID"),
		"hasSecret":    os.Getenv("GITHUB_CLIENT_SECRET") != "",
		"configured":   os.Getenv("GITHUB_CLIENT_ID") != "" && os.Getenv("GITHUB_CLIENT_SECRET") != "",
	})
}
