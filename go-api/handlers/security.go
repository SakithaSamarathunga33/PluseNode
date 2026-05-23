package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
	"sync"
	"time"
)

type SecurityHandler struct {
	mu    sync.Mutex
	scans []map[string]interface{}
	sboms []map[string]interface{}
}

func NewSecurityHandler() *SecurityHandler { return &SecurityHandler{} }

func (h *SecurityHandler) Scans(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	list := h.scans
	h.mu.Unlock()
	if list == nil {
		list = []map[string]interface{}{}
	}
	writeJSON(w, 200, list)
}

func (h *SecurityHandler) Scan(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Target string `json:"target"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Target == "" {
		writeErr(w, 400, "target is required")
		return
	}
	id := fmt.Sprintf("scan-%d", time.Now().UnixMilli())
	entry := map[string]interface{}{
		"id":       id,
		"image":    body.Target,
		"scanner":  "trivy",
		"started":  time.Now().UTC().Format(time.RFC3339),
		"status":   "running",
		"crit":     0,
		"high":     0,
		"med":      0,
		"low":      0,
		"duration": "—",
	}
	h.mu.Lock()
	h.scans = append(h.scans, entry)
	h.mu.Unlock()

	go func() {
		start := time.Now()
		crit, high, med, low, err := runTrivy(body.Target)
		dur := fmt.Sprintf("%.1fs", time.Since(start).Seconds())
		h.mu.Lock()
		defer h.mu.Unlock()
		for _, s := range h.scans {
			if s["id"] == id {
				if err != nil {
					s["status"] = "failed"
				} else {
					s["status"] = "done"
					s["crit"] = crit
					s["high"] = high
					s["med"] = med
					s["low"] = low
				}
				s["duration"] = dur
				break
			}
		}
	}()

	writeJSON(w, 200, entry)
}

func (h *SecurityHandler) SBOMs(w http.ResponseWriter, r *http.Request) {
	h.mu.Lock()
	list := h.sboms
	h.mu.Unlock()
	if list == nil {
		list = []map[string]interface{}{}
	}
	writeJSON(w, 200, list)
}

func (h *SecurityHandler) SBOM(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Target string `json:"target"`
		Format string `json:"format"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Target == "" {
		writeErr(w, 400, "target is required")
		return
	}
	if body.Format == "" {
		body.Format = "spdx-json"
	}
	entry := map[string]interface{}{
		"image":     body.Target,
		"format":    body.Format,
		"packages":  0,
		"generated": time.Now().UTC().Format(time.RFC3339),
		"licenses":  0,
		"ecosystem": map[string]int{"go": 0, "npm": 0, "deb": 0, "other": 0},
	}
	go func() {
		pkgs, eco, _ := runSBOM(body.Target, body.Format)
		h.mu.Lock()
		entry["packages"] = pkgs
		entry["ecosystem"] = eco
		h.sboms = append(h.sboms, entry)
		h.mu.Unlock()
	}()
	writeJSON(w, 200, entry)
}

// ── Trivy helpers ─────────────────────────────────────────────────────────────

func runTrivy(target string) (crit, high, med, low int, err error) {
	cmd := exec.Command("trivy", "image", "--format", "json", "--quiet", target)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err = cmd.Run(); err != nil {
		return
	}
	var result struct {
		Results []struct {
			Vulnerabilities []struct {
				Severity string `json:"Severity"`
			} `json:"Vulnerabilities"`
		} `json:"Results"`
	}
	if e := json.Unmarshal(out.Bytes(), &result); e != nil {
		err = e
		return
	}
	for _, res := range result.Results {
		for _, v := range res.Vulnerabilities {
			switch strings.ToUpper(v.Severity) {
			case "CRITICAL":
				crit++
			case "HIGH":
				high++
			case "MEDIUM":
				med++
			case "LOW":
				low++
			}
		}
	}
	return
}

func runSBOM(target, format string) (packages int, ecosystem map[string]int, err error) {
	ecosystem = map[string]int{"go": 0, "npm": 0, "deb": 0, "other": 0}
	cmd := exec.Command("trivy", "image", "--format", "spdx-json", "--quiet", target)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err = cmd.Run(); err != nil {
		return
	}
	var result struct {
		Packages []struct {
			Name string `json:"name"`
			SPDXID string `json:"SPDXID"`
		} `json:"packages"`
	}
	if e := json.Unmarshal(out.Bytes(), &result); e != nil {
		err = e
		return
	}
	packages = len(result.Packages)
	// rough categorisation by SPDXID prefix
	for _, p := range result.Packages {
		id := strings.ToLower(p.SPDXID)
		switch {
		case strings.Contains(id, "golang") || strings.Contains(p.Name, "go/"):
			ecosystem["go"]++
		case strings.Contains(id, "npm") || strings.Contains(p.Name, "node_modules"):
			ecosystem["npm"]++
		case strings.Contains(id, "deb") || strings.Contains(id, "apt"):
			ecosystem["deb"]++
		default:
			ecosystem["other"]++
		}
	}
	return
}

var _ = strconv.Itoa
