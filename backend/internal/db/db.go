package db

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"time"

	_ "modernc.org/sqlite"
)

type DB struct{ *sql.DB }

func Open(path string) (*DB, error) {
	raw, err := sql.Open("sqlite", path+"?_journal_mode=WAL&_foreign_keys=on")
	if err != nil {
		return nil, err
	}
	raw.SetMaxOpenConns(1) // SQLite: one writer at a time
	d := &DB{raw}
	if err := d.migrate(); err != nil {
		return nil, fmt.Errorf("migrate: %w", err)
	}
	return d, nil
}

func (d *DB) migrate() error {
	_, err := d.Exec(`
CREATE TABLE IF NOT EXISTS github_accounts (
  id           INTEGER PRIMARY KEY,
  login        TEXT NOT NULL,
  avatar_url   TEXT NOT NULL,
  access_token TEXT NOT NULL,
  token_type   TEXT NOT NULL DEFAULT 'oauth',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  repo_url      TEXT NOT NULL,
  branch        TEXT NOT NULL DEFAULT 'main',
  build_method  TEXT NOT NULL DEFAULT 'auto',
  build_command TEXT,
  port          INTEGER NOT NULL DEFAULT 3000,
  domain        TEXT NOT NULL,
  env_vars      TEXT NOT NULL DEFAULT '{}',
  container_id  TEXT,
  status        TEXT NOT NULL DEFAULT 'idle',
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployments (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',
  trigger     TEXT NOT NULL DEFAULT 'manual',
  commit_sha  TEXT,
  commit_msg  TEXT,
  started_at  DATETIME,
  finished_at DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deployment_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  deployment_id TEXT NOT NULL,
  stream        TEXT NOT NULL DEFAULT 'stdout',
  line          TEXT NOT NULL,
  ts            DATETIME DEFAULT CURRENT_TIMESTAMP
);
`)
	return err
}

// ── Encryption ────────────────────────────────────────────────────────────────

func aesKey() ([]byte, error) {
	k := os.Getenv("AES_KEY")
	if k == "" {
		k = os.Getenv("MASTER_ENCRYPTION_KEY")
	}
	if len(k) < 32 {
		return nil, errors.New("AES_KEY must be at least 32 chars")
	}
	return []byte(k[:32]), nil
}

func Encrypt(plaintext string) (string, error) {
	key, err := aesKey()
	if err != nil {
		return plaintext, nil // dev mode: store plain
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return hex.EncodeToString(sealed), nil
}

func Decrypt(ciphertext string) (string, error) {
	key, err := aesKey()
	if err != nil {
		return ciphertext, nil
	}
	data, err := hex.DecodeString(ciphertext)
	if err != nil {
		return ciphertext, nil // not encrypted, return as-is
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	if len(data) < gcm.NonceSize() {
		return ciphertext, nil
	}
	plain, err := gcm.Open(nil, data[:gcm.NonceSize()], data[gcm.NonceSize():], nil)
	if err != nil {
		return ciphertext, nil
	}
	return string(plain), nil
}

// ── ID generation ─────────────────────────────────────────────────────────────

func NewID(prefix string) string {
	b := make([]byte, 5)
	_, _ = rand.Read(b)
	return fmt.Sprintf("%s_%s", prefix, hex.EncodeToString(b))
}

// ── GitHub accounts ───────────────────────────────────────────────────────────

type GitHubAccount struct {
	ID          int64
	Login       string
	AvatarURL   string
	AccessToken string
	TokenType   string
	CreatedAt   time.Time
}

func (d *DB) UpsertGitHubAccount(login, avatarURL, token, tokenType string) error {
	enc, err := Encrypt(token)
	if err != nil {
		return err
	}
	_, err = d.Exec(`
INSERT INTO github_accounts (login, avatar_url, access_token, token_type)
VALUES (?, ?, ?, ?)
ON CONFLICT DO UPDATE SET login=excluded.login, avatar_url=excluded.avatar_url,
  access_token=excluded.access_token, token_type=excluded.token_type`,
		login, avatarURL, enc, tokenType)
	return err
}

func (d *DB) GetGitHubAccount() (*GitHubAccount, error) {
	row := d.QueryRow(`SELECT id, login, avatar_url, access_token, token_type, created_at FROM github_accounts LIMIT 1`)
	var a GitHubAccount
	var enc string
	if err := row.Scan(&a.ID, &a.Login, &a.AvatarURL, &enc, &a.TokenType, &a.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	token, err := Decrypt(enc)
	if err != nil {
		return nil, err
	}
	a.AccessToken = token
	return &a, nil
}

func (d *DB) DeleteGitHubAccount() error {
	_, err := d.Exec(`DELETE FROM github_accounts`)
	return err
}

// ── Projects ──────────────────────────────────────────────────────────────────

type Project struct {
	ID           string
	Name         string
	RepoURL      string
	Branch       string
	BuildMethod  string
	BuildCommand string
	Port         int
	Domain       string
	EnvVars      string // JSON map, encrypted at rest
	ContainerID  string
	Status       string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (d *DB) CreateProject(p *Project) error {
	enc, err := Encrypt(p.EnvVars)
	if err != nil {
		return err
	}
	_, err = d.Exec(`
INSERT INTO projects (id, name, repo_url, branch, build_method, build_command, port, domain, env_vars, status)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		p.ID, p.Name, p.RepoURL, p.Branch, p.BuildMethod, p.BuildCommand, p.Port, p.Domain, enc, p.Status)
	return err
}

func (d *DB) ListProjects() ([]Project, error) {
	rows, err := d.Query(`SELECT id, name, repo_url, branch, build_method, COALESCE(build_command,''), port, domain, env_vars, COALESCE(container_id,''), status, created_at, updated_at FROM projects ORDER BY created_at DESC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Project
	for rows.Next() {
		var p Project
		var enc string
		if err := rows.Scan(&p.ID, &p.Name, &p.RepoURL, &p.Branch, &p.BuildMethod, &p.BuildCommand, &p.Port, &p.Domain, &enc, &p.ContainerID, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
			return nil, err
		}
		p.EnvVars = "[]" // never expose values in list
		out = append(out, p)
	}
	return out, rows.Err()
}

func (d *DB) GetProject(id string) (*Project, error) {
	row := d.QueryRow(`SELECT id, name, repo_url, branch, build_method, COALESCE(build_command,''), port, domain, env_vars, COALESCE(container_id,''), status, created_at, updated_at FROM projects WHERE id=?`, id)
	var p Project
	var enc string
	if err := row.Scan(&p.ID, &p.Name, &p.RepoURL, &p.Branch, &p.BuildMethod, &p.BuildCommand, &p.Port, &p.Domain, &enc, &p.ContainerID, &p.Status, &p.CreatedAt, &p.UpdatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	plain, err := Decrypt(enc)
	if err != nil {
		return nil, err
	}
	p.EnvVars = plain
	return &p, nil
}

func (d *DB) UpdateProjectStatus(id, status, containerID string) error {
	_, err := d.Exec(`UPDATE projects SET status=?, container_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, status, containerID, id)
	return err
}

func (d *DB) UpdateProject(id, name, branch, buildMethod, buildCommand string, port int, domain, envVars string) error {
	enc, err := Encrypt(envVars)
	if err != nil {
		return err
	}
	_, err = d.Exec(`UPDATE projects SET name=?, branch=?, build_method=?, build_command=?, port=?, domain=?, env_vars=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
		name, branch, buildMethod, buildCommand, port, domain, enc, id)
	return err
}

func (d *DB) DeleteProject(id string) error {
	_, err := d.Exec(`DELETE FROM deployment_logs WHERE deployment_id IN (SELECT id FROM deployments WHERE project_id=?)`, id)
	if err != nil {
		return err
	}
	_, err = d.Exec(`DELETE FROM deployments WHERE project_id=?`, id)
	if err != nil {
		return err
	}
	_, err = d.Exec(`DELETE FROM projects WHERE id=?`, id)
	return err
}

// ── Deployments ───────────────────────────────────────────────────────────────

type Deployment struct {
	ID         string
	ProjectID  string
	Status     string
	Trigger    string
	CommitSHA  string
	CommitMsg  string
	StartedAt  *time.Time
	FinishedAt *time.Time
	CreatedAt  time.Time
}

func (d *DB) CreateDeployment(dep *Deployment) error {
	_, err := d.Exec(`
INSERT INTO deployments (id, project_id, status, trigger) VALUES (?, ?, ?, ?)`,
		dep.ID, dep.ProjectID, dep.Status, dep.Trigger)
	return err
}

func (d *DB) ListDeployments(projectID string) ([]Deployment, error) {
	rows, err := d.Query(`SELECT id, project_id, status, trigger, COALESCE(commit_sha,''), COALESCE(commit_msg,''), started_at, finished_at, created_at FROM deployments WHERE project_id=? ORDER BY created_at DESC LIMIT 20`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Deployment
	for rows.Next() {
		var dep Deployment
		if err := rows.Scan(&dep.ID, &dep.ProjectID, &dep.Status, &dep.Trigger, &dep.CommitSHA, &dep.CommitMsg, &dep.StartedAt, &dep.FinishedAt, &dep.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, dep)
	}
	return out, rows.Err()
}

func (d *DB) UpdateDeploymentStatus(id, status string, startedAt, finishedAt *time.Time) error {
	_, err := d.Exec(`UPDATE deployments SET status=?, started_at=?, finished_at=? WHERE id=?`, status, startedAt, finishedAt, id)
	return err
}

func (d *DB) GetDeploymentByID(id string) (*Deployment, error) {
	row := d.QueryRow(`SELECT id, project_id, status, trigger, COALESCE(commit_sha,''), COALESCE(commit_msg,''), started_at, finished_at, created_at FROM deployments WHERE id=?`, id)
	var dep Deployment
	if err := row.Scan(&dep.ID, &dep.ProjectID, &dep.Status, &dep.Trigger, &dep.CommitSHA, &dep.CommitMsg, &dep.StartedAt, &dep.FinishedAt, &dep.CreatedAt); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &dep, nil
}

func (d *DB) GetQueuedDeployments() ([]Deployment, error) {
	rows, err := d.Query(`SELECT id, project_id, status, trigger, COALESCE(commit_sha,''), COALESCE(commit_msg,''), started_at, finished_at, created_at FROM deployments WHERE status IN ('queued','building') ORDER BY created_at ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Deployment
	for rows.Next() {
		var dep Deployment
		if err := rows.Scan(&dep.ID, &dep.ProjectID, &dep.Status, &dep.Trigger, &dep.CommitSHA, &dep.CommitMsg, &dep.StartedAt, &dep.FinishedAt, &dep.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, dep)
	}
	return out, rows.Err()
}

// ── Deployment logs ───────────────────────────────────────────────────────────

func (d *DB) AppendLog(deploymentID, stream, line string) error {
	_, err := d.Exec(`INSERT INTO deployment_logs (deployment_id, stream, line) VALUES (?, ?, ?)`, deploymentID, stream, line)
	return err
}

func (d *DB) GetLogs(deploymentID string) ([]map[string]string, error) {
	rows, err := d.Query(`SELECT stream, line, ts FROM deployment_logs WHERE deployment_id=? ORDER BY id ASC`, deploymentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []map[string]string
	for rows.Next() {
		var stream, line string
		var ts time.Time
		if err := rows.Scan(&stream, &line, &ts); err != nil {
			return nil, err
		}
		out = append(out, map[string]string{"stream": stream, "line": line, "ts": ts.Format(time.RFC3339)})
	}
	return out, rows.Err()
}
