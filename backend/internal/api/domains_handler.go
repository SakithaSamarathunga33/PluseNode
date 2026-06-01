package api

import (
	"regexp"
	"sort"
	"strings"
)

var hostRuleRe = regexp.MustCompile("Host\\(`([^`]+)`\\)")

// parseTraefikHosts extracts every hostname from a container's Traefik router
// rule labels (traefik.http.routers.<name>.rule = Host(`a`) || Host(`b`)).
func parseTraefikHosts(labels map[string]string) []string {
	seen := map[string]bool{}
	var out []string
	for k, v := range labels {
		if !strings.HasPrefix(k, "traefik.http.routers.") || !strings.HasSuffix(k, ".rule") {
			continue
		}
		for _, m := range hostRuleRe.FindAllStringSubmatch(v, -1) {
			h := strings.ToLower(strings.TrimSpace(m[1]))
			if h != "" && !seen[h] {
				seen[h] = true
				out = append(out, h)
			}
		}
	}
	sort.Strings(out)
	return out
}
