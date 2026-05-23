// Package auth provides a JWT Bearer token middleware.
package auth

import (
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type Middleware func(http.Handler) http.Handler

// New returns a middleware that validates Bearer tokens when enabled is "true".
func New(enabled, secret string) Middleware {
	if strings.ToLower(enabled) != "true" {
		// Auth disabled — pass through everything
		return func(next http.Handler) http.Handler { return next }
	}
	if secret == "" {
		secret = "pulsenode-dev-secret"
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			if !strings.HasPrefix(header, "Bearer ") {
				http.Error(w, `{"error":"Missing Authorization header"}`, http.StatusUnauthorized)
				return
			}
			token := strings.TrimPrefix(header, "Bearer ")
			_, err := jwt.Parse(token, func(t *jwt.Token) (interface{}, error) {
				return []byte(secret), nil
			}, jwt.WithValidMethods([]string{"HS256"}))
			if err != nil {
				http.Error(w, `{"error":"Invalid or expired token"}`, http.StatusUnauthorized)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
