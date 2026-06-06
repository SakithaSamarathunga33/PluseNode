package github

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"time"
)

// AppClient authenticates GitHub API calls as a GitHub App using RS256 JWTs.
// Unlike the OAuth Client (token-based), AppClient signs every request with
// the App's RSA private key and can mint per-installation access tokens.
type AppClient struct {
	appID string
	key   *rsa.PrivateKey
	http  *http.Client
}

// NewAppClient parses the PEM private key and returns an App-authenticated client.
// Both PKCS#1 ("RSA PRIVATE KEY") and PKCS#8 ("PRIVATE KEY") formats are accepted —
// GitHub's key-download produces PKCS#1 but some tools export PKCS#8.
func NewAppClient(appID, pemKey string) (*AppClient, error) {
	key, err := ParseRSAPrivateKey(pemKey)
	if err != nil {
		return nil, err
	}
	return &AppClient{appID: appID, key: key, http: &http.Client{Timeout: 10 * time.Second}}, nil
}

// ParseRSAPrivateKey decodes a PEM-encoded RSA private key (PKCS#1 or PKCS#8).
func ParseRSAPrivateKey(pemKey string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemKey))
	if block == nil {
		return nil, fmt.Errorf("no PEM block found in private key")
	}
	switch block.Type {
	case "RSA PRIVATE KEY":
		return x509.ParsePKCS1PrivateKey(block.Bytes)
	case "PRIVATE KEY":
		k, err := x509.ParsePKCS8PrivateKey(block.Bytes)
		if err != nil {
			return nil, err
		}
		rk, ok := k.(*rsa.PrivateKey)
		if !ok {
			return nil, fmt.Errorf("PKCS8 key is not RSA")
		}
		return rk, nil
	}
	return nil, fmt.Errorf("unsupported PEM block type: %s", block.Type)
}

// jwt builds a short-lived RS256 JWT for GitHub App API authentication.
// GitHub allows a maximum of 10 minutes; we issue 9 to avoid edge cases.
func (c *AppClient) jwt() (string, error) {
	now := time.Now()
	hdr, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT"})
	pay, _ := json.Marshal(map[string]any{
		"iat": now.Add(-60 * time.Second).Unix(), // 60 s in the past to tolerate clock skew
		"exp": now.Add(9 * time.Minute).Unix(),
		"iss": c.appID,
	})
	msg := b64u(hdr) + "." + b64u(pay)
	h := sha256.New()
	h.Write([]byte(msg))
	sig, err := rsa.SignPKCS1v15(rand.Reader, c.key, crypto.SHA256, h.Sum(nil))
	if err != nil {
		return "", err
	}
	return msg + "." + b64u(sig), nil
}

func b64u(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func (c *AppClient) appReq(method, path string, in, out any) error {
	tok, err := c.jwt()
	if err != nil {
		return err
	}
	var body io.Reader
	if in != nil {
		data, _ := json.Marshal(in)
		body = bytes.NewReader(data)
	}
	req, err := http.NewRequest(method, apiBase+path, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+tok)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	if in != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("github app %s %s: %d %s", method, path, resp.StatusCode, string(b))
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// Installation represents one GitHub App installation on a user/org account.
type Installation struct {
	ID      int64 `json:"id"`
	Account struct {
		Login string `json:"login"`
		Type  string `json:"type"` // "User" or "Organization"
	} `json:"account"`
}

// InstallationToken is a short-lived access token scoped to one installation.
type InstallationToken struct {
	Token     string `json:"token"`
	ExpiresAt string `json:"expires_at"`
}

// GetInstallation fetches metadata for a single installation by ID.
func (c *AppClient) GetInstallation(id int64) (*Installation, error) {
	var v Installation
	return &v, c.appReq("GET", fmt.Sprintf("/app/installations/%d", id), nil, &v)
}

// GetInstallationToken mints a short-lived access token for an installation.
func (c *AppClient) GetInstallationToken(id int64) (*InstallationToken, error) {
	var tok InstallationToken
	return &tok, c.appReq("POST", fmt.Sprintf("/app/installations/%d/access_tokens", id), nil, &tok)
}

// InstallationRepos lists repos accessible to an installation using its token.
func InstallationRepos(installToken string) ([]Repo, error) {
	c := NewClient(installToken)
	var result struct {
		Repositories []Repo `json:"repositories"`
	}
	if err := c.get("/installation/repositories?per_page=100", &result); err != nil {
		return nil, err
	}
	return result.Repositories, nil
}
