package api

import (
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

type domainSettingsResponse struct {
	RootDomain string   `json:"rootDomain"`
	ExpectedIP string   `json:"expectedIp"`
	Aliases    []string `json:"aliases"`
}

type domainCheckResponse struct {
	Domain     string   `json:"domain"`
	ExpectedIP string   `json:"expectedIp"`
	Records    []string `json:"records"`
	Pointed    bool     `json:"pointed"`
	Proxied    bool     `json:"proxied"`
	Provider   string   `json:"provider,omitempty"`
	Message    string   `json:"message,omitempty"`
	Error      string   `json:"error,omitempty"`
	CheckedAt  string   `json:"checkedAt"`
}

func (s *Server) domainSettings(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, currentDomainSettings())
}

func (s *Server) saveDomainSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RootDomain string `json:"rootDomain"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON body"})
		return
	}
	root := cleanDomain(body.RootDomain)
	if root == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "rootDomain is required"})
		return
	}
	if err := upsertEnvLocal("PULSENODE_ROOT_DOMAIN", root); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	_ = os.Setenv("PULSENODE_ROOT_DOMAIN", root)
	writeJSON(w, http.StatusOK, currentDomainSettings())
}

func (s *Server) checkDomain(w http.ResponseWriter, r *http.Request) {
	domain := cleanDomain(r.URL.Query().Get("domain"))
	if domain == "" {
		domain = currentDomainSettings().RootDomain
	}
	if domain == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "domain is required"})
		return
	}

	expected := expectedVPSIP()
	res := domainCheckResponse{
		Domain:     domain,
		ExpectedIP: expected,
		Records:    []string{},
		CheckedAt:  time.Now().UTC().Format(time.RFC3339),
	}
	if expected == "" {
		res.Error = "Could not determine this VPS public IP"
		writeJSON(w, http.StatusOK, res)
		return
	}

	records, err := net.DefaultResolver.LookupIPAddr(r.Context(), domain)
	if err != nil {
		res.Error = err.Error()
		writeJSON(w, http.StatusOK, res)
		return
	}
	for _, record := range records {
		ip := record.IP.String()
		res.Records = append(res.Records, ip)
		if ip == expected {
			res.Pointed = true
		}
	}
	if !res.Pointed && len(res.Records) > 0 && allCloudflareIPs(res.Records) {
		res.Pointed = true
		res.Proxied = true
		res.Provider = "Cloudflare"
		res.Message = "DNS is proxied through Cloudflare, so public DNS returns Cloudflare edge IPs instead of the VPS origin IP."
	}
	writeJSON(w, http.StatusOK, res)
}

func allCloudflareIPs(records []string) bool {
	if len(records) == 0 {
		return false
	}
	for _, record := range records {
		ip := net.ParseIP(record)
		if ip == nil || !isCloudflareIP(ip) {
			return false
		}
	}
	return true
}

func isCloudflareIP(ip net.IP) bool {
	for _, cidr := range cloudflareCIDRs {
		_, network, err := net.ParseCIDR(cidr)
		if err == nil && network.Contains(ip) {
			return true
		}
	}
	return false
}

var cloudflareCIDRs = []string{
	"173.245.48.0/20",
	"103.21.244.0/22",
	"103.22.200.0/22",
	"103.31.4.0/22",
	"141.101.64.0/18",
	"108.162.192.0/18",
	"190.93.240.0/20",
	"188.114.96.0/20",
	"197.234.240.0/22",
	"198.41.128.0/17",
	"162.158.0.0/15",
	"104.16.0.0/13",
	"104.24.0.0/14",
	"172.64.0.0/13",
	"131.0.72.0/22",
	"2400:cb00::/32",
	"2606:4700::/32",
	"2803:f800::/32",
	"2405:b500::/32",
	"2405:8100::/32",
	"2a06:98c0::/29",
	"2c0f:f248::/32",
}

func currentDomainSettings() domainSettingsResponse {
	root := cleanDomain(firstNonEmpty(os.Getenv("PULSENODE_ROOT_DOMAIN"), os.Getenv("TRAEFIK_ROOT_DOMAIN")))
	if root == "" {
		root = rootFromHost(os.Getenv("TRAEFIK_HOST"))
	}
	if root == "" {
		root = rootFromURL(os.Getenv("NEXT_PUBLIC_ORIGIN"))
	}
	return domainSettingsResponse{
		RootDomain: root,
		ExpectedIP: expectedVPSIP(),
		Aliases:    []string{"@" + root, "*." + root},
	}
}

func expectedVPSIP() string {
	if ip := strings.TrimSpace(os.Getenv("VPS_IP")); ip != "" {
		return ip
	}
	if ip := strings.TrimSpace(os.Getenv("PULSENODE_VPS_IP")); ip != "" {
		return ip
	}
	host := hostFromURL(os.Getenv("NEXT_PUBLIC_ORIGIN"))
	if host == "" {
		host = os.Getenv("TRAEFIK_HOST")
	}
	if parsed := net.ParseIP(host); parsed != nil {
		return parsed.String()
	}
	if ip := lookupPublicIP(); ip != "" {
		return ip
	}
	ips, err := net.LookupIP(host)
	if err != nil {
		return ""
	}
	for _, ip := range ips {
		if v4 := ip.To4(); v4 != nil {
			return v4.String()
		}
	}
	if len(ips) > 0 {
		return ips[0].String()
	}
	return ""
}

func lookupPublicIP() string {
	client := http.Client{Timeout: 2 * time.Second}
	resp, err := client.Get("https://api.ipify.org")
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return ""
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 64))
	if err != nil {
		return ""
	}
	ip := strings.TrimSpace(string(data))
	if parsed := net.ParseIP(ip); parsed != nil {
		return parsed.String()
	}
	return ""
}

func rootFromURL(raw string) string {
	return rootFromHost(hostFromURL(raw))
}

func hostFromURL(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" {
		return cleanDomain(raw)
	}
	return cleanDomain(u.Hostname())
}

func rootFromHost(host string) string {
	host = cleanDomain(host)
	parts := strings.Split(host, ".")
	if len(parts) < 2 {
		return host
	}
	return strings.Join(parts[len(parts)-2:], ".")
}

func cleanDomain(domain string) string {
	domain = strings.TrimSpace(strings.ToLower(domain))
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "*.")
	domain = strings.TrimPrefix(domain, "@.")
	domain = strings.Trim(domain, "/.")
	if h, _, err := net.SplitHostPort(domain); err == nil {
		domain = h
	}
	return domain
}
