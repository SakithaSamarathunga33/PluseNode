package api

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// containerShell upgrades to WebSocket then proxies a TTY shell inside the container
// via Docker exec hijacking. The PTY is allocated by Docker inside the container —
// no CGO/creack/pty needed on the host.
func (s *Server) containerShell(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// 1. Create exec with TTY
	execID, err := s.docker.CreateTTYExec(r.Context(), id)
	if err != nil {
		http.Error(w, "exec create: "+err.Error(), http.StatusInternalServerError)
		return
	}

	// 2. Upgrade client connection to WebSocket
	ws, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Warn().Err(err).Str("container", id).Msg("ws upgrade failed")
		return
	}
	defer ws.Close()

	// 3. Hijack the Docker exec stream (raw TCP, TTY-mode, no multiplexing)
	dockerConn, err := hijackDockerExec(execID)
	if err != nil {
		_ = ws.WriteMessage(websocket.TextMessage, []byte("\r\n[pulsenode] shell error: "+err.Error()+"\r\n"))
		return
	}
	defer dockerConn.Close()

	ctx := r.Context()
	done := make(chan struct{}, 2)

	// Docker → WebSocket (container output → browser)
	go func() {
		defer func() { done <- struct{}{} }()
		buf := make([]byte, 4096)
		for {
			n, err := dockerConn.Read(buf)
			if n > 0 {
				if err2 := ws.WriteMessage(websocket.BinaryMessage, buf[:n]); err2 != nil {
					return
				}
			}
			if err != nil {
				return
			}
		}
	}()

	// WebSocket → Docker (browser keystrokes → container stdin)
	go func() {
		defer func() { done <- struct{}{} }()
		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				return
			}
			if _, err := dockerConn.Write(msg); err != nil {
				return
			}
		}
	}()

	select {
	case <-ctx.Done():
	case <-done:
	}
}

// hijackDockerExec dials the Docker socket directly and performs an HTTP upgrade
// to get a raw TCP connection for exec stdin/stdout.
func hijackDockerExec(execID string) (net.Conn, error) {
	conn, err := net.Dial("unix", "/var/run/docker.sock")
	if err != nil {
		return nil, fmt.Errorf("dial docker socket: %w", err)
	}

	body := `{"Detach":false,"Tty":true}`
	req := fmt.Sprintf(
		"POST /exec/%s/start HTTP/1.1\r\nHost: docker\r\nContent-Type: application/json\r\nContent-Length: %d\r\nConnection: Upgrade\r\nUpgrade: tcp\r\n\r\n%s",
		execID, len(body), body,
	)
	if _, err := conn.Write([]byte(req)); err != nil {
		conn.Close()
		return nil, fmt.Errorf("send exec start: %w", err)
	}

	// Read HTTP response headers only — leave the rest as raw stream
	br := bufio.NewReader(conn)
	resp, err := http.ReadResponse(br, nil)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("read exec response: %w", err)
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		conn.Close()
		return nil, fmt.Errorf("expected 101 Switching Protocols, got %d", resp.StatusCode)
	}

	// bufio.Reader may have buffered bytes ahead of the raw stream.
	// Wrap conn so buffered bytes are drained first.
	return &hijackedConn{Conn: conn, br: br}, nil
}

// hijackedConn uses buffered reader for reads (to drain any bytes the HTTP
// response parser buffered) and the raw conn for writes.
type hijackedConn struct {
	net.Conn
	br *bufio.Reader
}

func (h *hijackedConn) Read(p []byte) (int, error) { return h.br.Read(p) }

// ── Resize ────────────────────────────────────────────────────────────────────

// containerShellResize handles POST requests to resize the exec TTY.
func (s *Server) containerShellResize(w http.ResponseWriter, r *http.Request) {
	execID := r.URL.Query().Get("exec")
	if execID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "exec query param required"})
		return
	}
	var req struct {
		H int `json:"h"`
		W int `json:"w"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	if err := s.docker.ResizeExecTTY(r.Context(), execID, req.H, req.W); err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// ── Docker helpers ────────────────────────────────────────────────────────────

// These live here so they stay close to the shell code that uses them.
// CreateTTYExec and ResizeExecTTY are also added to the docker client via a
// separate method file, but defined inline here for clarity.

// createTTYExecBody builds the exec create payload.
func createTTYExecBody() []byte {
	b, _ := json.Marshal(map[string]any{
		"Cmd":          []string{"sh"},
		"AttachStdin":  true,
		"AttachStdout": true,
		"AttachStderr": true,
		"Tty":          true,
	})
	return b
}

var _ = createTTYExecBody // referenced by docker client directly
