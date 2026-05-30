package github

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const apiBase = "https://api.github.com"

type Client struct {
	token string
	http  *http.Client
}

func NewClient(token string) *Client {
	return &Client{token: token, http: &http.Client{Timeout: 10 * time.Second}}
}

func (c *Client) get(path string, out any) error {
	req, err := http.NewRequest(http.MethodGet, apiBase+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("github api %s: %d", path, resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// ── User ──────────────────────────────────────────────────────────────────────

type User struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	Name      string `json:"name"`
}

func (c *Client) CurrentUser() (*User, error) {
	var u User
	return &u, c.get("/user", &u)
}

// ── Repos ─────────────────────────────────────────────────────────────────────

type Repo struct {
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"default_branch"`
	HTMLURL       string `json:"html_url"`
	CloneURL      string `json:"clone_url"`
	Description   string `json:"description"`
}

func (c *Client) ListRepos() ([]Repo, error) {
	var repos []Repo
	page := 1
	for {
		var page_repos []Repo
		path := fmt.Sprintf("/user/repos?per_page=100&page=%d&sort=updated&type=all", page)
		if err := c.get(path, &page_repos); err != nil {
			return nil, err
		}
		repos = append(repos, page_repos...)
		if len(page_repos) < 100 {
			break
		}
		page++
		if page > 5 { // cap at 500 repos
			break
		}
	}
	return repos, nil
}

func (c *Client) ListBranches(owner, repo string) ([]string, error) {
	var raw []struct{ Name string `json:"name"` }
	if err := c.get(fmt.Sprintf("/repos/%s/%s/branches?per_page=100", owner, repo), &raw); err != nil {
		return nil, err
	}
	branches := make([]string, len(raw))
	for i, b := range raw {
		branches[i] = b.Name
	}
	return branches, nil
}

// GetBranchHead returns the latest commit SHA and message for a branch.
func (c *Client) GetBranchHead(owner, repo, branch string) (sha, msg string, err error) {
	var raw struct {
		Commit struct {
			SHA    string `json:"sha"`
			Commit struct {
				Message string `json:"message"`
			} `json:"commit"`
		} `json:"commit"`
	}
	path := fmt.Sprintf("/repos/%s/%s/branches/%s", owner, repo, url.PathEscape(branch))
	if err = c.get(path, &raw); err != nil {
		return "", "", err
	}
	msg = raw.Commit.Commit.Message
	if i := strings.IndexByte(msg, '\n'); i >= 0 {
		msg = msg[:i] // first line only
	}
	return raw.Commit.SHA, strings.TrimSpace(msg), nil
}

// ParseOwnerRepo extracts "owner" and "repo" from a GitHub clone/HTML URL.
// Supports https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git).
func ParseOwnerRepo(repoURL string) (owner, repo string, ok bool) {
	s := strings.TrimSpace(repoURL)
	s = strings.TrimSuffix(s, ".git")
	// Normalise scp-style SSH URLs (git@github.com:owner/repo) to a path.
	if i := strings.Index(s, "github.com"); i >= 0 {
		s = s[i+len("github.com"):]
		s = strings.TrimLeft(s, ":/")
	} else {
		return "", "", false
	}
	parts := strings.Split(s, "/")
	if len(parts) < 2 || parts[0] == "" || parts[1] == "" {
		return "", "", false
	}
	return parts[0], parts[1], true
}

// AuthorisedCloneURL injects the token for private repo access
func AuthorisedCloneURL(cloneURL, token string) string {
	if token == "" {
		return cloneURL
	}
	u, err := url.Parse(cloneURL)
	if err != nil {
		return cloneURL
	}
	u.User = url.UserPassword("x-access-token", token)
	return u.String()
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

func AuthURL(callbackURL string) string {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("redirect_uri", callbackURL)
	params.Set("scope", "repo read:user")
	return "https://github.com/login/oauth/authorize?" + params.Encode()
}

func ExchangeCode(code, callbackURL string) (string, error) {
	clientID := os.Getenv("GITHUB_CLIENT_ID")
	clientSecret := os.Getenv("GITHUB_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return "", fmt.Errorf("GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set")
	}

	params := url.Values{}
	params.Set("client_id", clientID)
	params.Set("client_secret", clientSecret)
	params.Set("code", code)
	params.Set("redirect_uri", callbackURL)

	req, err := http.NewRequest(http.MethodPost,
		"https://github.com/login/oauth/access_token",
		strings.NewReader(params.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if result.Error != "" {
		return "", fmt.Errorf("github oauth: %s — %s", result.Error, result.ErrorDesc)
	}
	return result.AccessToken, nil
}
