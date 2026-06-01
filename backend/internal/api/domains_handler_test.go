package api

import (
	"reflect"
	"testing"
)

func TestParseTraefikHosts(t *testing.T) {
	cases := []struct {
		name   string
		labels map[string]string
		want   []string
	}{
		{
			name:   "single host",
			labels: map[string]string{"traefik.http.routers.web.rule": "Host(`app.example.com`)"},
			want:   []string{"app.example.com"},
		},
		{
			name:   "alternation",
			labels: map[string]string{"traefik.http.routers.web.rule": "Host(`a.com`) || Host(`b.com`)"},
			want:   []string{"a.com", "b.com"},
		},
		{
			name: "path prefix mixed in",
			labels: map[string]string{
				"traefik.http.routers.api.rule": "Host(`api.example.com`) && PathPrefix(`/v1`)",
			},
			want: []string{"api.example.com"},
		},
		{
			name:   "non-rule labels ignored",
			labels: map[string]string{"traefik.enable": "true", "com.docker.compose.project": "x"},
			want:   nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseTraefikHosts(tc.labels)
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("got %v, want %v", got, tc.want)
			}
		})
	}
}
