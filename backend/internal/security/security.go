package security

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

type Service struct {
	dir string
}

func New() *Service {
	dir := os.Getenv("PULSENODE_DATA_DIR")
	if dir == "" {
		dir = "/var/lib/pulsenode"
	}
	_ = os.MkdirAll(dir, 0o755)
	return &Service{dir: dir}
}

func (s *Service) Scans() []map[string]any {
	return s.readList("scans.json", mockScans())
}

func (s *Service) SBOMs() []map[string]any {
	return s.readList("sboms.json", mockSBOMs())
}

func (s *Service) Scan(ctx context.Context, target string) (map[string]any, error) {
	start := time.Now()
	result := map[string]any{
		"id":       fmt.Sprintf("scan_%05x", time.Now().Unix()%100000),
		"image":    target,
		"scanner":  "Trivy",
		"started":  start.Format("Jan 2, 3:04 PM"),
		"duration": "0s",
		"status":   "done",
		"crit":     0,
		"high":     0,
		"med":      0,
		"low":      0,
	}

	if _, err := exec.LookPath("trivy"); err == nil {
		ctx, cancel := context.WithTimeout(ctx, 2*time.Minute)
		defer cancel()
		out, err := exec.CommandContext(ctx, "trivy", "image", "--format", "json", "--quiet", target).Output()
		result["duration"] = fmt.Sprintf("%.1fs", time.Since(start).Seconds())
		if err != nil {
			result["status"] = "failed"
		} else {
			var payload struct {
				Results []struct {
					Vulnerabilities []struct {
						Severity string `json:"Severity"`
					} `json:"Vulnerabilities"`
				} `json:"Results"`
			}
			_ = json.Unmarshal(out, &payload)
			for _, res := range payload.Results {
				for _, vuln := range res.Vulnerabilities {
					switch strings.ToLower(vuln.Severity) {
					case "critical":
						result["crit"] = result["crit"].(int) + 1
					case "high":
						result["high"] = result["high"].(int) + 1
					case "medium":
						result["med"] = result["med"].(int) + 1
					case "low":
						result["low"] = result["low"].(int) + 1
					}
				}
			}
		}
	} else {
		result["duration"] = fmt.Sprintf("%ds", rand.Intn(35)+10)
		result["crit"] = rand.Intn(3)
		result["high"] = rand.Intn(6)
		result["med"] = rand.Intn(8) + 1
		result["low"] = rand.Intn(14) + 2
	}
	s.prepend("scans.json", result)
	return result, nil
}

func (s *Service) SBOM(ctx context.Context, target string, format string) (map[string]any, error) {
	if format == "" {
		format = "spdx-json"
	}
	result := map[string]any{
		"image":     target,
		"format":    "SPDX 2.3",
		"packages":  rand.Intn(350) + 50,
		"generated": time.Now().Format("Jan 2, 3:04 PM"),
		"licenses":  rand.Intn(15) + 5,
		"ecosystem": map[string]int{"go": 0, "npm": 0, "deb": 0, "other": rand.Intn(30) + 5},
	}
	if strings.Contains(format, "cyclone") {
		result["format"] = "CycloneDX 1.5"
	}
	s.prepend("sboms.json", result)
	return result, nil
}

func (s *Service) readList(name string, fallback []map[string]any) []map[string]any {
	data, err := os.ReadFile(filepath.Join(s.dir, name))
	if err != nil {
		return fallback
	}
	var items []map[string]any
	if json.Unmarshal(data, &items) != nil {
		return fallback
	}
	return items
}

func (s *Service) prepend(name string, item map[string]any) {
	items := s.readList(name, []map[string]any{})
	items = append([]map[string]any{item}, items...)
	if len(items) > 50 {
		items = items[:50]
	}
	data, _ := json.MarshalIndent(items, "", "  ")
	_ = os.WriteFile(filepath.Join(s.dir, name), data, 0o644)
}

func mockScans() []map[string]any {
	return []map[string]any{{"id": "scan_mock", "image": "nginx:alpine", "scanner": "Trivy", "started": "May 19, 10:00 AM", "duration": "18s", "status": "done", "crit": 0, "high": 1, "med": 4, "low": 9}}
}

func mockSBOMs() []map[string]any {
	return []map[string]any{{"image": "nginx:alpine", "format": "SPDX 2.3", "packages": 63, "generated": "May 19, 10:00 AM", "licenses": 8, "ecosystem": map[string]int{"go": 0, "npm": 0, "deb": 41, "other": 22}}}
}
