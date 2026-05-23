package handlers

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql"
	_ "github.com/lib/pq"
	goredis "github.com/redis/go-redis/v9"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	monopts "go.mongodb.org/mongo-driver/mongo/options"

	"pulsenode/api/docker"
	"pulsenode/api/store"
)

// DBCreds holds resolved connection parameters for a DB container.
type DBCreds struct {
	Engine   string
	Host     string
	Port     int
	User     string
	Password string
	Database string
}

type DatabaseHandler struct{ dc *docker.Client }

func NewDatabaseHandler(dc *docker.Client) *DatabaseHandler {
	return &DatabaseHandler{dc: dc}
}

// ── Database inspect (aggregated view across all DB containers) ───────────────

func (h *DatabaseHandler) Inspect(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeJSON(w, 200, []map[string]interface{}{})
		return
	}
	ctrs, err := h.dc.ListContainers(true)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	dbImages := []string{"postgres", "mysql", "mariadb", "redis", "mongo"}
	var result []map[string]interface{}
	for _, c := range ctrs {
		imgLower := strings.ToLower(c.Image)
		isDB := false
		for _, d := range dbImages {
			if strings.Contains(imgLower, d) {
				isDB = true
				break
			}
		}
		if !isDB || c.State != "running" {
			continue
		}
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		entry := map[string]interface{}{
			"name":     name,
			"engine":   "unknown",
			"tables":   []interface{}{},
			"slowQueries": []interface{}{},
			"activeConns": []interface{}{},
		}
		if creds, err := h.getDbCreds(name); err == nil {
			entry["engine"] = creds.Engine
		}
		result = append(result, entry)
	}
	if result == nil {
		result = []map[string]interface{}{}
	}
	writeJSON(w, 200, result)
}

// Connections returns connection counts per database container.
func (h *DatabaseHandler) Connections(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeJSON(w, 200, []map[string]interface{}{})
		return
	}
	ctrs, err := h.dc.ListContainers(false)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	dbImages := []string{"postgres", "mysql", "mariadb", "redis", "mongo"}
	var result []map[string]interface{}
	for _, c := range ctrs {
		imgLower := strings.ToLower(c.Image)
		isDB := false
		for _, d := range dbImages {
			if strings.Contains(imgLower, d) {
				isDB = true
				break
			}
		}
		if !isDB {
			continue
		}
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		result = append(result, map[string]interface{}{"name": name, "conns": 0})
	}
	if result == nil {
		result = []map[string]interface{}{}
	}
	writeJSON(w, 200, result)
}

// ── Custom connections ────────────────────────────────────────────────────────

func (h *DatabaseHandler) ListCustom(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, store.List())
}

func (h *DatabaseHandler) TestCustom(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ConnectionString string `json:"connectionString"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.ConnectionString == "" {
		writeErr(w, 400, "connectionString required")
		return
	}
	info, err := testConnection(body.ConnectionString)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, info)
}

func (h *DatabaseHandler) SaveCustom(w http.ResponseWriter, r *http.Request) {
	var c store.Connection
	if err := json.NewDecoder(r.Body).Decode(&c); err != nil || c.ConnectionString == "" {
		writeErr(w, 400, "connectionString required")
		return
	}
	saved, err := store.Add(c)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, saved)
}

func (h *DatabaseHandler) DeleteCustom(w http.ResponseWriter, r *http.Request) {
	if err := store.Remove(r.PathValue("id")); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	ok(w)
}

// ── Provision ─────────────────────────────────────────────────────────────────

func (h *DatabaseHandler) Provision(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeErr(w, 503, "not available in mock mode")
		return
	}
	var body struct {
		Engine string `json:"engine"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Engine == "" {
		writeErr(w, 400, "engine required")
		return
	}

	type cfg struct {
		image   string
		env     []string
		cmd     []string
		port    string
		user    string
		db      string
	}
	password := randomPass()
	suffix := randomHex(3)
	name := "pn-" + body.Engine + "-" + suffix

	configs := map[string]cfg{
		"postgres": {
			image: "postgres:16-alpine",
			env:   []string{"POSTGRES_PASSWORD=" + password, "POSTGRES_USER=postgres", "POSTGRES_DB=postgres"},
			port:  "5432/tcp", user: "postgres", db: "postgres",
		},
		"mysql": {
			image: "mysql:8.0",
			env:   []string{"MYSQL_ROOT_PASSWORD=" + password, "MYSQL_DATABASE=mydb"},
			port:  "3306/tcp", user: "root", db: "mydb",
		},
		"redis": {
			image: "redis:7-alpine",
			cmd:   []string{"redis-server", "--requirepass", password},
			port:  "6379/tcp",
		},
		"mongodb": {
			image: "mongo:7",
			env:   []string{"MONGO_INITDB_ROOT_USERNAME=root", "MONGO_INITDB_ROOT_PASSWORD=" + password, "MONGO_INITDB_DATABASE=mydb"},
			port:  "27017/tcp", user: "root", db: "mydb",
		},
	}
	c, ok2 := configs[body.Engine]
	if !ok2 {
		writeErr(w, 400, "unknown engine: "+body.Engine)
		return
	}

	if err := h.dc.PullImage(c.image); err != nil {
		writeErr(w, 500, "pull failed: "+err.Error())
		return
	}

	containerCfg := docker.CreateContainerConfig{
		Image: c.image,
		Name:  name,
		Env:   c.env,
		Cmd:   c.cmd,
		ExposedPorts: map[string]struct{}{c.port: {}},
		HostConfig: docker.CreateHostConfig{
			PortBindings: map[string][]docker.PortBinding{c.port: {{HostPort: ""}}},
		},
	}
	containerCfg.HostConfig.RestartPolicy.Name = "unless-stopped"

	cid, err := h.dc.CreateContainer(containerCfg)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	if err := h.dc.StartContainer(cid); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	h.dc.JoinSelfNetworks(name)

	// Get assigned host port
	ci, err := h.dc.InspectContainer(name)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	bindings := ci.NetworkSettings.Ports[c.port]
	assignedPort := "0"
	if len(bindings) > 0 {
		assignedPort = bindings[0].HostPort
	}

	origin := getOriginHost()
	connStr := buildConnStr(body.Engine, c.user, password, origin, assignedPort, c.db)
	writeJSON(w, 200, map[string]interface{}{
		"name":             name,
		"engine":           body.Engine,
		"image":            c.image,
		"port":             assignedPort,
		"password":         password,
		"connectionString": connStr,
	})
}

// ── Connection string ─────────────────────────────────────────────────────────

func (h *DatabaseHandler) ConnectionString(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeJSON(w, 200, map[string]interface{}{"connectionString": nil, "isExternal": false})
		return
	}
	name := r.PathValue("name")
	creds, err := h.getDbCreds(name)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	ci, err := h.dc.InspectContainer(name)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	portKey := map[string]string{
		"postgres": "5432/tcp", "mysql": "3306/tcp",
		"redis": "6379/tcp", "mongodb": "27017/tcp",
	}[creds.Engine]
	bindings := ci.NetworkSettings.Ports[portKey]
	extPort := ""
	if len(bindings) > 0 {
		extPort = bindings[0].HostPort
	}
	host := getOriginHost()
	port := extPort
	if port == "" {
		port = strconv.Itoa(creds.Port)
		host = creds.Host
	}
	connStr := buildConnStr(creds.Engine, creds.User, creds.Password, host, port, creds.Database)
	writeJSON(w, 200, map[string]interface{}{
		"connectionString": connStr,
		"isExternal":       extPort != "",
	})
}

// ── Schema ────────────────────────────────────────────────────────────────────

func (h *DatabaseHandler) Schema(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	selectedDB := r.URL.Query().Get("database")
	if h.dc.IsMock() {
		writeJSON(w, 200, map[string]interface{}{
			"databases": []string{"postgres", "myapp"},
			"tables":    []map[string]interface{}{{"name": "users", "rows": 1240}, {"name": "orders", "rows": 5830}},
		})
		return
	}
	creds, err := h.getDbCreds(name)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var result interface{}
	switch creds.Engine {
	case "postgres":
		result, err = pgSchema(creds, selectedDB)
	case "mysql":
		result, err = mysqlSchema(creds, selectedDB)
	case "redis":
		result, err = redisSchema(creds)
	case "mongodb":
		result, err = mongoSchema(creds, selectedDB)
	default:
		writeErr(w, 400, "unsupported engine: "+creds.Engine)
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, result)
}

// ── DB Metrics ────────────────────────────────────────────────────────────────

func (h *DatabaseHandler) Metrics(w http.ResponseWriter, r *http.Request) {
	name := r.PathValue("name")
	if h.dc.IsMock() {
		writeJSON(w, 200, map[string]interface{}{
			"engine": "postgres",
			"metrics": []map[string]interface{}{
				{"label": "Active Connections", "value": 3},
				{"label": "Cache Hit Rate", "value": "98.5%", "tone": "ok"},
			},
		})
		return
	}
	creds, err := h.getDbCreds(name)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	var result interface{}
	switch creds.Engine {
	case "postgres":
		result, err = pgMetrics(creds)
	case "mysql":
		result, err = mysqlMetrics(creds)
	case "redis":
		result, err = redisMetrics(creds)
	case "mongodb":
		result, err = mongoMetrics(creds)
	default:
		writeErr(w, 400, "unsupported engine")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, result)
}

// ── Backup ────────────────────────────────────────────────────────────────────

func (h *DatabaseHandler) Backup(w http.ResponseWriter, r *http.Request) {
	if h.dc.IsMock() {
		writeErr(w, 503, "backup not available in mock mode")
		return
	}
	name := r.PathValue("name")
	creds, err := h.getDbCreds(name)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	date := time.Now().Format("2006-01-02")
	var cmd []string
	var filename, contentType string
	var env []string

	switch creds.Engine {
	case "postgres":
		filename = name + "-" + date + ".sql"
		contentType = "text/plain; charset=utf-8"
		env = []string{"PGPASSWORD=" + creds.Password}
		cmd = []string{"pg_dump", "-U", creds.User, "-d", creds.Database}
	case "mysql":
		filename = name + "-" + date + ".sql"
		contentType = "text/plain; charset=utf-8"
		cmd = []string{"mysqldump", "-u", creds.User, "-p" + creds.Password, creds.Database}
	case "redis":
		filename = name + "-" + date + ".rdb"
		contentType = "application/octet-stream"
		auth := ""
		if creds.Password != "" {
			auth = "-a '" + creds.Password + "'"
		}
		cmd = []string{"sh", "-c", "redis-cli --no-auth-warning " + auth + " SAVE && cat /data/dump.rdb"}
	case "mongodb":
		filename = name + "-" + date + ".archive"
		contentType = "application/octet-stream"
		authFlag := ""
		if creds.User != "" {
			authFlag = fmt.Sprintf("--username '%s' --password '%s' --authenticationDatabase admin", creds.User, creds.Password)
		}
		cmd = []string{"sh", "-c", fmt.Sprintf("mongodump --archive --db '%s' %s", creds.Database, authFlag)}
	default:
		writeErr(w, 400, "backup not supported for engine: "+creds.Engine)
		return
	}

	execID, err := h.dc.ExecCreateWithEnv(name, cmd, env)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Content-Type", contentType)
	w.WriteHeader(200)
	_ = h.dc.ExecStream(execID, env, w)
}

// ── Query ─────────────────────────────────────────────────────────────────────

func (h *DatabaseHandler) Query(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Query    string `json:"query"`
		Database string `json:"database"`
		Force    bool   `json:"force"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Query == "" {
		writeErr(w, 400, "query is required")
		return
	}
	if !body.Force && isDestructive(body.Query) {
		writeErr(w, 422, "Destructive query detected. Send force:true to proceed.")
		return
	}
	if h.dc.IsMock() {
		writeJSON(w, 200, map[string]interface{}{
			"columns":    []string{"id", "name"},
			"rows":       [][]interface{}{{1, "example"}},
			"rowCount":   1,
			"durationMs": 5,
		})
		return
	}
	name := r.PathValue("name")
	creds, err := h.getDbCreds(name)
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	start := time.Now()
	var result interface{}
	switch creds.Engine {
	case "postgres":
		result, err = pgQuery(creds, body.Query, body.Database)
	case "mysql":
		result, err = mysqlQuery(creds, body.Query, body.Database)
	case "redis":
		result, err = redisQuery(creds, body.Query)
	case "mongodb":
		result, err = mongoQuery(creds, body.Query, body.Database)
	default:
		writeErr(w, 400, "unsupported engine")
		return
	}
	if err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	// Inject durationMs
	if m, ok := result.(map[string]interface{}); ok {
		m["durationMs"] = time.Since(start).Milliseconds()
	}
	writeJSON(w, 200, result)
}

// ── Credential resolution ─────────────────────────────────────────────────────

func (h *DatabaseHandler) getDbCreds(containerName string) (*DBCreds, error) {
	ci, err := h.dc.InspectContainer(containerName)
	if err != nil {
		return nil, err
	}
	env := docker.ParseEnv(ci.Config.Env)
	host := docker.ContainerIP(ci)
	img := strings.ToLower(ci.Config.Image)

	switch {
	case strings.Contains(img, "postgres"):
		return &DBCreds{
			Engine: "postgres", Host: host, Port: 5432,
			User:     orDefault(env["POSTGRES_USER"], "postgres"),
			Password: env["POSTGRES_PASSWORD"],
			Database: orDefault(env["POSTGRES_DB"], orDefault(env["POSTGRES_USER"], "postgres")),
		}, nil
	case strings.Contains(img, "mysql") || strings.Contains(img, "mariadb"):
		return &DBCreds{
			Engine: "mysql", Host: host, Port: 3306,
			User:     orDefault(env["MYSQL_USER"], "root"),
			Password: orDefault(env["MYSQL_ROOT_PASSWORD"], env["MYSQL_PASSWORD"]),
			Database: env["MYSQL_DATABASE"],
		}, nil
	case strings.Contains(img, "redis"):
		return &DBCreds{Engine: "redis", Host: host, Port: 6379, Password: env["REDIS_PASSWORD"]}, nil
	case strings.Contains(img, "mongo"):
		return &DBCreds{
			Engine: "mongodb", Host: host, Port: 27017,
			User:     env["MONGO_INITDB_ROOT_USERNAME"],
			Password: env["MONGO_INITDB_ROOT_PASSWORD"],
			Database: orDefault(env["MONGO_INITDB_DATABASE"], "admin"),
		}, nil
	default:
		return nil, fmt.Errorf("unsupported engine for image: %s", ci.Config.Image)
	}
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

func pgDSN(c *DBCreds, database string) string {
	db := database
	if db == "" {
		db = c.Database
	}
	return fmt.Sprintf("host=%s port=%d user=%s password=%s dbname=%s sslmode=disable connect_timeout=5",
		c.Host, c.Port, c.User, c.Password, db)
}

func pgSchema(c *DBCreds, selectedDB string) (map[string]interface{}, error) {
	db, err := sql.Open("postgres", pgDSN(c, ""))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var databases []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		databases = append(databases, name)
	}

	var tables []map[string]interface{}
	if selectedDB != "" {
		db2, err := sql.Open("postgres", pgDSN(c, selectedDB))
		if err == nil {
			defer db2.Close()
			trows, err := db2.QueryContext(ctx, `
				SELECT c.relname AS name
				FROM pg_class c
				JOIN pg_namespace n ON n.oid = c.relnamespace
				WHERE c.relkind = 'r' AND n.nspname NOT IN ('pg_catalog','information_schema')
				ORDER BY c.relname`)
			if err == nil {
				defer trows.Close()
				var names []string
				for trows.Next() {
					var n string
					trows.Scan(&n)
					names = append(names, n)
				}
				for _, n := range names {
					var count int
					db2.QueryRowContext(ctx, `SELECT COUNT(*)::int FROM "`+n+`"`).Scan(&count)
					tables = append(tables, map[string]interface{}{"name": n, "rows": count})
				}
			}
		}
	}
	if tables == nil {
		tables = []map[string]interface{}{}
	}
	return map[string]interface{}{"databases": databases, "tables": tables}, nil
}

func pgMetrics(c *DBCreds) (map[string]interface{}, error) {
	db, err := sql.Open("postgres", pgDSN(c, ""))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var numBackends, xactCommit, xactRollback, tupInserted, tupUpdated, tupDeleted, tupFetched int64
	var cacheHitPct sql.NullFloat64
	var size string
	var active int

	db.QueryRowContext(ctx, `
		SELECT numbackends, xact_commit, xact_rollback,
		       ROUND(blks_hit::numeric/NULLIF(blks_hit+blks_read,0)*100,1) AS cache_hit_pct,
		       tup_inserted, tup_updated, tup_deleted, tup_fetched
		FROM pg_stat_database WHERE datname=$1`, c.Database).
		Scan(&numBackends, &xactCommit, &xactRollback, &cacheHitPct, &tupInserted, &tupUpdated, &tupDeleted, &tupFetched)

	db.QueryRowContext(ctx, `SELECT pg_size_pretty(pg_database_size($1))`, c.Database).Scan(&size)
	db.QueryRowContext(ctx, `SELECT count(*)::int FROM pg_stat_activity WHERE state='active'`).Scan(&active)

	hitStr := "—"
	hitTone := "ok"
	if cacheHitPct.Valid {
		hitStr = fmt.Sprintf("%.1f%%", cacheHitPct.Float64)
		if cacheHitPct.Float64 < 90 {
			hitTone = "warn"
		}
	}
	rollbackTone := "ok"
	if xactRollback > 0 {
		rollbackTone = "warn"
	}
	return map[string]interface{}{
		"engine": "postgres",
		"metrics": []map[string]interface{}{
			{"label": "Active Connections", "value": active},
			{"label": "Total Connections", "value": numBackends},
			{"label": "Cache Hit Rate", "value": hitStr, "tone": hitTone},
			{"label": "Database Size", "value": size},
			{"label": "Commits", "value": fmt.Sprintf("%d", xactCommit)},
			{"label": "Rollbacks", "value": xactRollback, "tone": rollbackTone},
			{"label": "Rows Fetched", "value": fmt.Sprintf("%d", tupFetched)},
			{"label": "Rows Inserted", "value": fmt.Sprintf("%d", tupInserted)},
			{"label": "Rows Updated", "value": fmt.Sprintf("%d", tupUpdated)},
			{"label": "Rows Deleted", "value": fmt.Sprintf("%d", tupDeleted)},
		},
	}, nil
}

func pgQuery(c *DBCreds, query, database string) (map[string]interface{}, error) {
	db, err := sql.Open("postgres", pgDSN(c, database))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	var result [][]interface{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		row := make([]interface{}, len(cols))
		for i, v := range vals {
			row[i] = v
		}
		result = append(result, row)
		if len(result) >= 100 {
			break
		}
	}
	if result == nil {
		result = [][]interface{}{}
	}
	return map[string]interface{}{"columns": cols, "rows": result, "rowCount": len(result)}, nil
}

// ── MySQL ─────────────────────────────────────────────────────────────────────

func mysqlDSN(c *DBCreds, database string) string {
	db := database
	if db == "" {
		db = c.Database
	}
	extra := ""
	if db != "" {
		extra = db
	}
	return fmt.Sprintf("%s:%s@tcp(%s:%d)/%s?timeout=5s&readTimeout=30s",
		c.User, c.Password, c.Host, c.Port, extra)
}

func mysqlSchema(c *DBCreds, selectedDB string) (map[string]interface{}, error) {
	db, err := sql.Open("mysql", mysqlDSN(c, ""))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	skip := map[string]bool{"information_schema": true, "performance_schema": true, "mysql": true, "sys": true}
	rows, err := db.QueryContext(ctx, "SHOW DATABASES")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var databases []string
	for rows.Next() {
		var name string
		rows.Scan(&name)
		if !skip[name] {
			databases = append(databases, name)
		}
	}

	var tables []map[string]interface{}
	if selectedDB != "" {
		trows, err := db.QueryContext(ctx,
			"SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_ROWS DESC",
			selectedDB)
		if err == nil {
			defer trows.Close()
			for trows.Next() {
				var name string
				var count sql.NullInt64
				trows.Scan(&name, &count)
				tables = append(tables, map[string]interface{}{"name": name, "rows": count.Int64})
			}
		}
	}
	if tables == nil {
		tables = []map[string]interface{}{}
	}
	return map[string]interface{}{"databases": databases, "tables": tables}, nil
}

func mysqlMetrics(c *DBCreds) (map[string]interface{}, error) {
	db, err := sql.Open("mysql", mysqlDSN(c, ""))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, `SHOW GLOBAL STATUS WHERE Variable_name IN (
		'Threads_connected','Threads_running','Questions',
		'Com_select','Com_insert','Com_update','Com_delete',
		'Innodb_buffer_pool_read_requests','Innodb_buffer_pool_reads',
		'Uptime','Aborted_connects')`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	m := make(map[string]int64)
	for rows.Next() {
		var k string
		var v int64
		rows.Scan(&k, &v)
		m[k] = v
	}
	bpReqs := m["Innodb_buffer_pool_read_requests"]
	bpReads := m["Innodb_buffer_pool_reads"]
	bpHit := "—"
	bpTone := "ok"
	if bpReqs > 0 {
		pct := (1 - float64(bpReads)/float64(bpReqs)) * 100
		bpHit = fmt.Sprintf("%.1f%%", pct)
		if pct < 90 {
			bpTone = "warn"
		}
	}
	abortedTone := "ok"
	if m["Aborted_connects"] > 0 {
		abortedTone = "warn"
	}
	return map[string]interface{}{
		"engine": "mysql",
		"metrics": []map[string]interface{}{
			{"label": "Threads Connected", "value": m["Threads_connected"]},
			{"label": "Threads Running", "value": m["Threads_running"]},
			{"label": "Total Queries", "value": fmt.Sprintf("%d", m["Questions"])},
			{"label": "SELECT", "value": fmt.Sprintf("%d", m["Com_select"])},
			{"label": "INSERT", "value": fmt.Sprintf("%d", m["Com_insert"])},
			{"label": "UPDATE", "value": fmt.Sprintf("%d", m["Com_update"])},
			{"label": "DELETE", "value": fmt.Sprintf("%d", m["Com_delete"])},
			{"label": "Buffer Pool Hit Rate", "value": bpHit, "tone": bpTone},
			{"label": "Uptime", "value": fmtUptime(m["Uptime"])},
			{"label": "Aborted Connects", "value": m["Aborted_connects"], "tone": abortedTone},
		},
	}, nil
}

func mysqlQuery(c *DBCreds, query, database string) (map[string]interface{}, error) {
	db, err := sql.Open("mysql", mysqlDSN(c, database))
	if err != nil {
		return nil, err
	}
	defer db.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	rows, err := db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, _ := rows.Columns()
	var result [][]interface{}
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		rows.Scan(ptrs...)
		row := make([]interface{}, len(cols))
		for i, v := range vals {
			if b, ok := v.([]byte); ok {
				row[i] = string(b)
			} else {
				row[i] = v
			}
		}
		result = append(result, row)
		if len(result) >= 100 {
			break
		}
	}
	if result == nil {
		result = [][]interface{}{}
	}
	return map[string]interface{}{"columns": cols, "rows": result, "rowCount": len(result)}, nil
}

// ── Redis ─────────────────────────────────────────────────────────────────────

func newRedis(c *DBCreds) *goredis.Client {
	opts := &goredis.Options{
		Addr:        fmt.Sprintf("%s:%d", c.Host, c.Port),
		DialTimeout: 5 * time.Second,
	}
	if c.Password != "" {
		opts.Password = c.Password
	}
	return goredis.NewClient(opts)
}

func redisSchema(c *DBCreds) (map[string]interface{}, error) {
	rdb := newRedis(c)
	defer rdb.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	count, err := rdb.DBSize(ctx).Result()
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"databases": []string{"db0"},
		"tables":    []map[string]interface{}{{"name": fmt.Sprintf("%d keys total", count), "rows": count}},
	}, nil
}

func redisMetrics(c *DBCreds) (map[string]interface{}, error) {
	rdb := newRedis(c)
	defer rdb.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	raw, err := rdb.Info(ctx, "all").Result()
	if err != nil {
		return nil, err
	}
	m := parseRedisInfo(raw)

	hits, _ := strconv.ParseInt(m["keyspace_hits"], 10, 64)
	misses, _ := strconv.ParseInt(m["keyspace_misses"], 10, 64)
	hitStr := "—"
	hitTone := "ok"
	if hits+misses > 0 {
		pct := float64(hits) / float64(hits+misses) * 100
		hitStr = fmt.Sprintf("%.1f%%", pct)
		if pct < 80 {
			hitTone = "warn"
		}
	}
	var keys int64
	if ksDef, ok := m["db0"]; ok {
		for _, part := range strings.Split(ksDef, ",") {
			if strings.HasPrefix(part, "keys=") {
				keys, _ = strconv.ParseInt(strings.TrimPrefix(part, "keys="), 10, 64)
			}
		}
	}
	uptime, _ := strconv.ParseInt(m["uptime_in_seconds"], 10, 64)
	clients, _ := strconv.ParseInt(m["connected_clients"], 10, 64)
	cmds, _ := strconv.ParseInt(m["total_commands_processed"], 10, 64)

	return map[string]interface{}{
		"engine": "redis",
		"metrics": []map[string]interface{}{
			{"label": "Connected Clients", "value": clients},
			{"label": "Used Memory", "value": m["used_memory_human"]},
			{"label": "Peak Memory", "value": m["used_memory_peak_human"]},
			{"label": "Total Keys", "value": keys},
			{"label": "Keyspace Hits", "value": fmt.Sprintf("%d", hits)},
			{"label": "Keyspace Misses", "value": fmt.Sprintf("%d", misses)},
			{"label": "Hit Rate", "value": hitStr, "tone": hitTone},
			{"label": "Commands Processed", "value": fmt.Sprintf("%d", cmds)},
			{"label": "Uptime", "value": fmtUptime(uptime)},
			{"label": "Redis Version", "value": m["redis_version"]},
		},
	}, nil
}

func redisQuery(c *DBCreds, command string) (map[string]interface{}, error) {
	rdb := newRedis(c)
	defer rdb.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	parts := strings.Fields(strings.TrimSpace(command))
	if len(parts) == 0 {
		return nil, fmt.Errorf("empty command")
	}
	args := make([]interface{}, len(parts))
	for i, p := range parts {
		args[i] = p
	}
	result, err := rdb.Do(ctx, args...).Result()
	if err != nil {
		return nil, err
	}
	if arr, ok := result.([]interface{}); ok {
		cols := []string{"index", "value"}
		rows := make([][]interface{}, len(arr))
		for i, v := range arr {
			rows[i] = []interface{}{i, fmt.Sprintf("%v", v)}
		}
		return map[string]interface{}{"columns": cols, "rows": rows, "rowCount": len(rows)}, nil
	}
	return map[string]interface{}{
		"columns": []string{"result"},
		"rows":    [][]interface{}{{fmt.Sprintf("%v", result)}},
		"rowCount": 1,
	}, nil
}

// ── MongoDB ───────────────────────────────────────────────────────────────────

func mongoURI(c *DBCreds) string {
	if c.User != "" {
		return fmt.Sprintf("mongodb://%s:%s@%s:%d",
			url.QueryEscape(c.User), url.QueryEscape(c.Password), c.Host, c.Port)
	}
	return fmt.Sprintf("mongodb://%s:%d", c.Host, c.Port)
}

func mongoSchema(c *DBCreds, selectedDB string) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, monopts.Client().ApplyURI(mongoURI(c)).
		SetServerSelectionTimeout(5*time.Second))
	if err != nil {
		return nil, err
	}
	defer client.Disconnect(ctx)

	skipDB := map[string]bool{"admin": true, "local": true, "config": true}
	dbList, err := client.ListDatabaseNames(ctx, bson.D{})
	if err != nil {
		return nil, err
	}
	var databases []string
	for _, name := range dbList {
		if !skipDB[name] {
			databases = append(databases, name)
		}
	}

	target := selectedDB
	if target == "" && len(databases) > 0 {
		target = databases[0]
	}
	var tables []map[string]interface{}
	if target != "" {
		colls, err := client.Database(target).ListCollectionNames(ctx, bson.D{})
		if err == nil {
			for _, cname := range colls {
				count, _ := client.Database(target).Collection(cname).EstimatedDocumentCount(ctx)
				tables = append(tables, map[string]interface{}{"name": cname, "rows": count})
			}
		}
	}
	if tables == nil {
		tables = []map[string]interface{}{}
	}
	return map[string]interface{}{"databases": databases, "tables": tables}, nil
}

func mongoMetrics(c *DBCreds) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, monopts.Client().ApplyURI(mongoURI(c)).
		SetServerSelectionTimeout(5*time.Second))
	if err != nil {
		return nil, err
	}
	defer client.Disconnect(ctx)

	var status bson.M
	if err := client.Database("admin").RunCommand(ctx, bson.D{{Key: "serverStatus", Value: 1}}).Decode(&status); err != nil {
		return nil, err
	}
	conn := getNestedMap(status, "connections")
	ops := getNestedMap(status, "opcounters")
	mem := getNestedMap(status, "mem")
	version, _ := status["version"].(string)
	uptimeSecs, _ := status["uptimeSeconds"].(float64)

	return map[string]interface{}{
		"engine": "mongodb",
		"metrics": []map[string]interface{}{
			{"label": "Current Connections", "value": conn["current"]},
			{"label": "Available Connections", "value": conn["available"]},
			{"label": "Queries", "value": fmt.Sprintf("%v", ops["query"])},
			{"label": "Inserts", "value": fmt.Sprintf("%v", ops["insert"])},
			{"label": "Updates", "value": fmt.Sprintf("%v", ops["update"])},
			{"label": "Deletes", "value": fmt.Sprintf("%v", ops["delete"])},
			{"label": "Virtual Memory", "value": fmt.Sprintf("%v MB", mem["virtual"])},
			{"label": "Resident Memory", "value": fmt.Sprintf("%v MB", mem["resident"])},
			{"label": "Uptime", "value": fmtUptime(int64(uptimeSecs))},
			{"label": "MongoDB Version", "value": version},
		},
	}, nil
}

func mongoQuery(c *DBCreds, query, database string) (map[string]interface{}, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := mongo.Connect(ctx, monopts.Client().ApplyURI(mongoURI(c)).
		SetServerSelectionTimeout(5*time.Second))
	if err != nil {
		return nil, err
	}
	defer client.Disconnect(ctx)

	parts := strings.SplitN(strings.TrimSpace(query), " ", 2)
	collection := parts[0]
	filterStr := "{}"
	if len(parts) > 1 {
		filterStr = strings.TrimSpace(parts[1])
	}
	var filter bson.D
	if err := bson.UnmarshalExtJSON([]byte(filterStr), true, &filter); err != nil {
		return nil, fmt.Errorf("invalid JSON filter: %w", err)
	}
	db := database
	if db == "" {
		db = c.Database
	}
	cursor, err := client.Database(db).Collection(collection).Find(ctx, filter,
		monopts.Find().SetLimit(100))
	if err != nil {
		return nil, err
	}
	var docs []bson.M
	if err := cursor.All(ctx, &docs); err != nil {
		return nil, err
	}
	if len(docs) == 0 {
		return map[string]interface{}{"columns": []string{}, "rows": [][]interface{}{}, "rowCount": 0}, nil
	}
	colSet := make(map[string]struct{})
	for _, d := range docs {
		for k := range d {
			colSet[k] = struct{}{}
		}
	}
	cols := make([]string, 0, len(colSet))
	for k := range colSet {
		cols = append(cols, k)
	}
	rows := make([][]interface{}, len(docs))
	for i, d := range docs {
		row := make([]interface{}, len(cols))
		for j, col := range cols {
			v := d[col]
			if v == nil {
				row[j] = nil
			} else {
				b, _ := json.Marshal(v)
				row[j] = string(b)
			}
		}
		rows[i] = row
	}
	return map[string]interface{}{"columns": cols, "rows": rows, "rowCount": len(rows)}, nil
}

// ── External connection test ──────────────────────────────────────────────────

func testConnection(connectionString string) (map[string]interface{}, error) {
	u, err := url.Parse(connectionString)
	if err != nil {
		return nil, err
	}
	proto := strings.TrimSuffix(u.Scheme, "+srv")
	if proto == "postgresql" {
		proto = "postgres"
	}
	host := u.Hostname()
	portStr := u.Port()
	user := u.User.Username()
	pass, _ := u.User.Password()
	database := strings.TrimPrefix(u.Path, "/")
	defaultPorts := map[string]int{"postgres": 5432, "mysql": 3306, "redis": 6379, "mongodb": 27017}
	port := defaultPorts[proto]
	if p, err := strconv.Atoi(portStr); err == nil && p > 0 {
		port = p
	}
	c := &DBCreds{Engine: proto, Host: host, Port: port, User: user, Password: pass, Database: database}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	switch proto {
	case "postgres":
		db, err := sql.Open("postgres", pgDSN(c, database))
		if err != nil {
			return nil, err
		}
		defer db.Close()
		db.SetConnMaxLifetime(5 * time.Second)
		var version string
		if err := db.QueryRowContext(ctx, "SELECT version()").Scan(&version); err != nil {
			return nil, err
		}
		if m := regexp.MustCompile(`PostgreSQL\s+([\d.]+)`).FindStringSubmatch(version); len(m) > 1 {
			version = m[1]
		}
		return map[string]interface{}{"engine": proto, "host": host, "port": port, "user": user, "database": database, "version": version}, nil
	case "mysql":
		db, err := sql.Open("mysql", mysqlDSN(c, database))
		if err != nil {
			return nil, err
		}
		defer db.Close()
		var version string
		db.QueryRowContext(ctx, "SELECT VERSION()").Scan(&version)
		return map[string]interface{}{"engine": proto, "host": host, "port": port, "user": user, "database": database, "version": version}, nil
	case "redis":
		rdb := newRedis(c)
		defer rdb.Close()
		info, err := rdb.Info(ctx, "server").Result()
		if err != nil {
			return nil, err
		}
		m := parseRedisInfo(info)
		return map[string]interface{}{"engine": proto, "host": host, "port": port, "version": m["redis_version"]}, nil
	case "mongodb":
		client, err := mongo.Connect(ctx, monopts.Client().ApplyURI(connectionString).
			SetServerSelectionTimeout(5*time.Second))
		if err != nil {
			return nil, err
		}
		defer client.Disconnect(ctx)
		var info bson.M
		client.Database("admin").RunCommand(ctx, bson.D{{Key: "serverStatus", Value: 1}}).Decode(&info)
		version, _ := info["version"].(string)
		return map[string]interface{}{"engine": proto, "host": host, "port": port, "user": user, "database": database, "version": version}, nil
	default:
		return nil, fmt.Errorf("unsupported engine: %s", proto)
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

var destructiveRE = []*regexp.Regexp{
	regexp.MustCompile(`(?i)\bDROP\s+(TABLE|DATABASE|SCHEMA|INDEX)\b`),
	regexp.MustCompile(`(?i)\bTRUNCATE\b`),
	regexp.MustCompile(`(?i)\bDELETE\s+FROM\b`),
	regexp.MustCompile(`(?i)\bUPDATE\b`),
}
var whereRE = regexp.MustCompile(`(?i)\bWHERE\b`)

func isDestructive(query string) bool {
	q := strings.Join(strings.Fields(strings.ToUpper(query)), " ")
	if destructiveRE[0].MatchString(q) {
		return true
	}
	if destructiveRE[1].MatchString(q) {
		return true
	}
	if destructiveRE[2].MatchString(q) && !whereRE.MatchString(q) {
		return true
	}
	if destructiveRE[3].MatchString(q) && !whereRE.MatchString(q) {
		return true
	}
	return false
}

func fmtUptime(seconds int64) string {
	d := seconds / 86400
	h := (seconds % 86400) / 3600
	m := (seconds % 3600) / 60
	if d > 0 {
		return fmt.Sprintf("%dd %dh", d, h)
	}
	if h > 0 {
		return fmt.Sprintf("%dh %dm", h, m)
	}
	return fmt.Sprintf("%dm", m)
}

func parseRedisInfo(raw string) map[string]string {
	m := make(map[string]string)
	for _, line := range strings.Split(raw, "\r\n") {
		if idx := strings.Index(line, ":"); idx != -1 {
			m[strings.TrimSpace(line[:idx])] = strings.TrimSpace(line[idx+1:])
		}
	}
	return m
}

func getNestedMap(m bson.M, key string) bson.M {
	if v, ok := m[key]; ok {
		if nm, ok := v.(bson.M); ok {
			return nm
		}
	}
	return bson.M{}
}

func buildConnStr(engine, user, pass, host, port, database string) string {
	p := url.QueryEscape(pass)
	switch engine {
	case "postgres":
		return fmt.Sprintf("postgresql://%s:%s@%s:%s/%s", user, p, host, port, database)
	case "mysql":
		return fmt.Sprintf("mysql://%s:%s@%s:%s/%s", user, p, host, port, database)
	case "redis":
		if pass != "" {
			return fmt.Sprintf("redis://:%s@%s:%s", p, host, port)
		}
		return fmt.Sprintf("redis://%s:%s", host, port)
	case "mongodb":
		if user != "" {
			return fmt.Sprintf("mongodb://%s:%s@%s:%s/%s?authSource=admin",
				url.QueryEscape(user), p, host, port, database)
		}
		return fmt.Sprintf("mongodb://%s:%s/%s", host, port, database)
	default:
		return fmt.Sprintf("%s://%s:%s", engine, host, port)
	}
}

func getOriginHost() string {
	origin := getenv("NEXT_PUBLIC_ORIGIN", "http://localhost:3000")
	origin = strings.TrimPrefix(strings.TrimPrefix(origin, "https://"), "http://")
	parts := strings.SplitN(origin, "/", 2)
	hostPort := strings.SplitN(parts[0], ":", 2)
	return hostPort[0]
}

func orDefault(a, b string) string {
	if a != "" {
		return a
	}
	return b
}

func randomPass() string {
	b := make([]byte, 18)
	rand.Read(b)
	return base64.RawURLEncoding.EncodeToString(b)
}

func randomHex(n int) string {
	b := make([]byte, n)
	rand.Read(b)
	return fmt.Sprintf("%x", b)
}

func getenv(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

var _ = math.Abs
