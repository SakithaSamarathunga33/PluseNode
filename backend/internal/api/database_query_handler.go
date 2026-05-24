package api

import (
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	dbpkg "pulsenode/backend/internal/db"
)

// resolveManagedDB resolves a container name like "pn-db-postgres-mydb" to its managed DB record.
// Container names follow the pattern pn-db-{engine}-{name} set during provisioning.
func (s *Server) resolveManagedDB(containerName string) (*dbpkg.ManagedDatabase, error) {
	stripped := strings.TrimPrefix(containerName, "pn-db-")
	var engine, name string
	for _, eng := range []string{"postgres", "mysql", "mongodb", "redis"} {
		if strings.HasPrefix(stripped, eng+"-") {
			engine = eng
			name = strings.TrimPrefix(stripped, eng+"-")
			break
		}
	}
	if engine == "" || name == "" {
		return nil, fmt.Errorf("container %q is not a PulseNode-managed database", containerName)
	}
	m, err := s.db.GetManagedDatabaseByContainerName(engine, name)
	if err != nil {
		return nil, err
	}
	if m == nil {
		return nil, fmt.Errorf("no managed database record found for container %q", containerName)
	}
	return m, nil
}

type dbSchemaResult struct {
	Databases []string      `json:"databases"`
	Tables    []dbTableInfo `json:"tables"`
}

type dbTableInfo struct {
	Name string `json:"name"`
	Rows int    `json:"rows"`
}

type dbQueryResult struct {
	Columns    []string        `json:"columns"`
	Rows       [][]interface{} `json:"rows"`
	RowCount   int             `json:"rowCount"`
	DurationMs int64           `json:"durationMs"`
}

func (s *Server) databaseConnectionString(w http.ResponseWriter, r *http.Request) {
	containerName := chi.URLParam(r, "name")
	mdb, err := s.resolveManagedDB(containerName)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"connectionString": buildConnString(mdb)})
}

func (s *Server) databaseSchema(w http.ResponseWriter, r *http.Request) {
	if !s.requireDocker(w) {
		return
	}
	containerName := chi.URLParam(r, "name")
	mdb, err := s.resolveManagedDB(containerName)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	dbParam := r.URL.Query().Get("database")
	if dbParam == "" {
		dbParam = mdb.DBName
	}

	ctx := r.Context()
	result := dbSchemaResult{Databases: []string{mdb.DBName}, Tables: []dbTableInfo{}}

	switch mdb.Engine {
	case "postgres":
		if out, err := s.docker.ExecSlice(ctx, containerName, []string{
			"psql", "-U", mdb.Username, "-d", mdb.DBName, "-At", "-c",
			"SELECT datname FROM pg_database WHERE datistemplate=false ORDER BY datname;",
		}); err == nil {
			dbs := []string{}
			seen := map[string]bool{}
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				if line = strings.TrimSpace(line); line != "" && !seen[line] {
					seen[line] = true
					dbs = append(dbs, line)
				}
			}
			if len(dbs) > 0 {
				result.Databases = dbs
			}
		}
		// Fetch table names + estimated row counts in one query via pg_stat_user_tables.
		// n_live_tup is a planner estimate (updated by autovacuum) — fast and accurate enough for display.
		if out, err := s.docker.ExecSlice(ctx, containerName, []string{
			"psql", "-U", mdb.Username, "-d", dbParam, "-At", "-F", "|", "-c",
			"SELECT t.tablename, COALESCE(s.n_live_tup, 0) FROM pg_tables t LEFT JOIN pg_stat_user_tables s ON s.relname=t.tablename WHERE t.schemaname='public' ORDER BY t.tablename;",
		}); err == nil {
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				if line = strings.TrimSpace(line); line != "" {
					parts := strings.SplitN(line, "|", 2)
					name := parts[0]
					rows := 0
					if len(parts) == 2 {
						fmt.Sscanf(parts[1], "%d", &rows)
					}
					result.Tables = append(result.Tables, dbTableInfo{Name: name, Rows: rows})
				}
			}
		}

	case "mysql":
		if out, err := s.docker.ExecSlice(ctx, containerName, []string{
			"mysql", "-u" + mdb.Username, "-p" + mdb.Password, "-N", "-e", "SHOW DATABASES;",
		}); err == nil {
			skip := map[string]bool{"information_schema": true, "performance_schema": true, "mysql": true, "sys": true}
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				if line = strings.TrimSpace(line); line != "" && !skip[line] {
					result.Databases = append(result.Databases, line)
				}
			}
		}
		if out, err := s.docker.ExecSlice(ctx, containerName, []string{
			"mysql", "-u" + mdb.Username, "-p" + mdb.Password, "-N", "-e", "SHOW TABLES;", dbParam,
		}); err == nil {
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				if line = strings.TrimSpace(line); line != "" {
					result.Tables = append(result.Tables, dbTableInfo{Name: line})
				}
			}
		}

	case "mongodb":
		if out, err := s.docker.ExecSlice(ctx, containerName, []string{
			"mongosh", "--quiet", "--eval",
			`db.adminCommand({listDatabases:1}).databases.map(d=>d.name).join("\n")`,
		}); err == nil {
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				if line = strings.TrimSpace(line); line != "" {
					result.Databases = append(result.Databases, line)
				}
			}
		}
		if out, err := s.docker.ExecSlice(ctx, containerName, []string{
			"mongosh", dbParam, "--quiet", "--eval",
			`db.getCollectionNames().join("\n")`,
		}); err == nil {
			for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
				if line = strings.TrimSpace(line); line != "" {
					result.Tables = append(result.Tables, dbTableInfo{Name: line})
				}
			}
		}

	// Redis has no schema
	}

	writeJSON(w, http.StatusOK, result)
}

func (s *Server) databaseQuery(w http.ResponseWriter, r *http.Request) {
	if !s.requireDocker(w) {
		return
	}
	containerName := chi.URLParam(r, "name")
	mdb, err := s.resolveManagedDB(containerName)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}

	var body struct {
		Query    string `json:"query"`
		Database string `json:"database"`
		Force    bool   `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Query) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "query is required"})
		return
	}

	dbParam := body.Database
	if dbParam == "" {
		dbParam = mdb.DBName
	}

	// Warn on destructive queries unless force=true
	if !body.Force && isDestructiveQuery(body.Query) {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": "destructive query — confirm to proceed"})
		return
	}

	ctx := r.Context()
	start := time.Now()
	var qResult *dbQueryResult
	var qErr error

	switch mdb.Engine {
	case "postgres":
		qResult, qErr = s.runPostgresQuery(ctx, containerName, mdb, dbParam, body.Query)
	case "mysql":
		qResult, qErr = s.runMysqlQuery(ctx, containerName, mdb, dbParam, body.Query)
	case "redis":
		qResult, qErr = s.runRedisCommand(ctx, containerName, body.Query)
	case "mongodb":
		qResult, qErr = s.runMongoQuery(ctx, containerName, dbParam, body.Query)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": fmt.Sprintf("query not supported for engine %q", mdb.Engine)})
		return
	}

	if qErr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": qErr.Error()})
		return
	}
	qResult.DurationMs = time.Since(start).Milliseconds()
	writeJSON(w, http.StatusOK, qResult)
}

func isDestructiveQuery(query string) bool {
	upper := strings.ToUpper(strings.TrimSpace(query))
	for _, kw := range []string{"DROP ", "TRUNCATE ", "DELETE ", "UPDATE "} {
		if strings.Contains(upper, kw) {
			return true
		}
	}
	return false
}

func (s *Server) runPostgresQuery(ctx context.Context, container string, mdb *dbpkg.ManagedDatabase, dbName, query string) (*dbQueryResult, error) {
	out, err := s.docker.ExecSlice(ctx, container, []string{
		"psql", "-U", mdb.Username, "-d", dbName, "--csv", "-c", query,
	})
	if err != nil {
		return nil, fmt.Errorf("exec: %w", err)
	}
	trimmed := strings.TrimSpace(out)
	if strings.HasPrefix(trimmed, "ERROR:") || strings.HasPrefix(trimmed, "FATAL:") {
		return nil, fmt.Errorf("%s", trimmed)
	}
	// DDL/DML: single-word response like "CREATE TABLE" or "INSERT 0 1"
	if !strings.Contains(trimmed, "\n") {
		return &dbQueryResult{Columns: []string{}, Rows: [][]interface{}{}, RowCount: 0}, nil
	}
	return parseCSVResult(trimmed)
}

func (s *Server) runMysqlQuery(ctx context.Context, container string, mdb *dbpkg.ManagedDatabase, dbName, query string) (*dbQueryResult, error) {
	out, err := s.docker.ExecSlice(ctx, container, []string{
		"mysql", "-u" + mdb.Username, "-p" + mdb.Password, "--batch", "--silent", "-e", query, dbName,
	})
	if err != nil {
		return nil, fmt.Errorf("exec: %w", err)
	}
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		return &dbQueryResult{Columns: []string{}, Rows: [][]interface{}{}, RowCount: 0}, nil
	}
	if strings.HasPrefix(trimmed, "ERROR") {
		return nil, fmt.Errorf("%s", trimmed)
	}
	return parseTSVResult(trimmed)
}

func (s *Server) runRedisCommand(ctx context.Context, container, command string) (*dbQueryResult, error) {
	parts := strings.Fields(strings.TrimSpace(command))
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	cmd := append([]string{"redis-cli"}, parts...)
	out, err := s.docker.ExecSlice(ctx, container, cmd)
	if err != nil {
		return nil, fmt.Errorf("exec: %w", err)
	}
	return &dbQueryResult{
		Columns:  []string{"result"},
		Rows:     [][]interface{}{{strings.TrimSpace(out)}},
		RowCount: 1,
	}, nil
}

func (s *Server) runMongoQuery(ctx context.Context, container, dbName, query string) (*dbQueryResult, error) {
	out, err := s.docker.ExecSlice(ctx, container, []string{
		"mongosh", dbName, "--quiet", "--eval", query,
	})
	if err != nil {
		return nil, fmt.Errorf("exec: %w", err)
	}
	return &dbQueryResult{
		Columns:  []string{"output"},
		Rows:     [][]interface{}{{strings.TrimSpace(out)}},
		RowCount: 1,
	}, nil
}

func parseCSVResult(raw string) (*dbQueryResult, error) {
	r := csv.NewReader(strings.NewReader(raw))
	records, err := r.ReadAll()
	if err != nil || len(records) == 0 {
		return &dbQueryResult{Columns: []string{}, Rows: [][]interface{}{}, RowCount: 0}, nil
	}
	columns := records[0]
	rows := make([][]interface{}, 0, len(records)-1)
	for _, rec := range records[1:] {
		row := make([]interface{}, len(rec))
		for i, v := range rec {
			if v == "" {
				row[i] = nil
			} else {
				row[i] = v
			}
		}
		rows = append(rows, row)
	}
	return &dbQueryResult{Columns: columns, Rows: rows, RowCount: len(rows)}, nil
}

func parseTSVResult(raw string) (*dbQueryResult, error) {
	lines := strings.Split(raw, "\n")
	if len(lines) == 0 {
		return &dbQueryResult{Columns: []string{}, Rows: [][]interface{}{}, RowCount: 0}, nil
	}
	columns := strings.Split(lines[0], "\t")
	rows := make([][]interface{}, 0, len(lines)-1)
	for _, line := range lines[1:] {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.Split(line, "\t")
		row := make([]interface{}, len(parts))
		for i, v := range parts {
			if v == "NULL" {
				row[i] = nil
			} else {
				row[i] = v
			}
		}
		rows = append(rows, row)
	}
	return &dbQueryResult{Columns: columns, Rows: rows, RowCount: len(rows)}, nil
}
