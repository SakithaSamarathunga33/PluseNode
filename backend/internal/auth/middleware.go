package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	Enabled bool
	Secret  string
}

type Middleware struct {
	enabled bool
	secret  []byte
}

func NewMiddleware(cfg Config) *Middleware {
	return &Middleware{enabled: cfg.Enabled, secret: []byte(cfg.Secret)}
}

func (m *Middleware) Require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !m.enabled {
			next.ServeHTTP(w, r)
			return
		}
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeAuthError(w, "Missing Authorization header")
			return
		}
		if !m.validJWT(strings.TrimPrefix(header, "Bearer ")) {
			writeAuthError(w, "Invalid or expired token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (m *Middleware) validJWT(token string) bool {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return false
	}
	mac := hmac.New(sha256.New, m.secret)
	mac.Write([]byte(parts[0] + "." + parts[1]))
	expected := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(parts[2])) {
		return false
	}

	var claims map[string]any
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || json.Unmarshal(payload, &claims) != nil {
		return false
	}
	if exp, ok := claims["exp"].(float64); ok && exp > 0 {
		return int64(exp) > nowUnix()
	}
	return true
}

func nowUnix() int64 {
	return time.Now().Unix()
}

func writeAuthError(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusUnauthorized)
	_, _ = w.Write([]byte(`{"error":"` + message + `"}`))
}
