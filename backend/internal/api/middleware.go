package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/httprate"
)

// RateLimit returns a per-IP rate limiter middleware.
func RateLimit(reqs int, window time.Duration) func(http.Handler) http.Handler {
	return httprate.LimitByIP(reqs, window)
}

// AuditLog records every state-changing request into the audit_log table.
func (s *Server) AuditLog(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		rw := &statusRecorder{ResponseWriter: w, code: 200}
		next.ServeHTTP(rw, r)

		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			return
		}
		actor := "anonymous"
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			actor = "authenticated"
		}
		ip := r.RemoteAddr
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			ip = strings.Split(fwd, ",")[0]
		}
		s.db.InsertAuditLog(actor, r.Method+" "+r.URL.Path, r.URL.Path, ip, rw.code)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	code int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.code = code
	r.ResponseWriter.WriteHeader(code)
}

// Flush forwards to the underlying ResponseWriter so SSE / streaming works.
func (r *statusRecorder) Flush() {
	if f, ok := r.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets chi and other middleware reach the underlying writer.
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

// requireAuth replaces s.auth.Require. It checks whether a user account exists in the
// DB (auth enabled) and, if so, validates either the pn_session cookie or a Bearer token.
// When no user exists, all requests pass through (auth disabled).
func (s *Server) requireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, _ := s.db.GetUser()
		if user == nil {
			// No admin account configured — auth is off.
			next.ServeHTTP(w, r)
			return
		}
		// Cookie path (browser sessions). Slide the session on each authenticated
		// request — re-issue a fresh token so an active user isn't logged out
		// mid-action when the original 30-min token expires. Idle sessions still
		// expire (no requests → no renewal).
		if c, err := r.Cookie("pn_session"); err == nil && s.auth.ValidateToken(c.Value) {
			setSessionCookie(w, s.auth.MakeJWT(user.Username, sessionTTL), int(sessionTTL))
			next.ServeHTTP(w, r)
			return
		}
		// Bearer token path (API / scripts).
		if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") &&
			s.auth.ValidateToken(strings.TrimPrefix(h, "Bearer ")) {
			next.ServeHTTP(w, r)
			return
		}
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Unauthorized"})
	})
}
