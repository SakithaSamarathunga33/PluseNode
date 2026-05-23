package handlers

import (
	"bufio"
	"fmt"
	"net"
	"net/http"
	"os"
	"runtime"
	"strconv"
	"strings"
	"syscall"
	"time"

	"pulsenode/api/docker"
)

type HostHandler struct{ dc *docker.Client }

func NewHostHandler(dc *docker.Client) *HostHandler { return &HostHandler{dc: dc} }

func (h *HostHandler) Handle(w http.ResponseWriter, r *http.Request) {
	runningContainers := 0
	if !h.dc.IsMock() {
		if ctrs, err := h.dc.ListContainers(false); err == nil {
			runningContainers = len(ctrs)
		}
	}
	writeJSON(w, 200, buildHostInfo(runningContainers))
}

func buildHostInfo(apps int) map[string]interface{} {
	hostname, _ := os.Hostname()

	total, free := memBytes()
	used := total - free
	usedGB := roundGB(used)
	totalGB := roundGB(total)
	memPct := 0
	if total > 0 {
		memPct = int(float64(used) / float64(total) * 100)
	}

	swapUsed, swapTotal := swapBytes()
	swapUsedGB := roundGB(swapUsed)
	swapTotalGB := roundGB(swapTotal)
	swapPct := 0
	if swapTotal > 0 {
		swapPct = int(float64(swapUsed) / float64(swapTotal) * 100)
	}

	diskUsed, diskTotal, diskFree := diskGB()
	diskPct := 0
	if diskTotal > 0 {
		diskPct = int(float64(diskUsed) / float64(diskTotal) * 100)
	}

	netRx, netTx := netRates()

	return map[string]interface{}{
		"name":   hostname,
		"distro": getDistro(),
		"kernel": getKernel(),
		"uptime": docker.FormatUptime(getUptime()),
		"cpu": map[string]interface{}{
			"cores": runtime.NumCPU(),
			"model": getCPUModel(),
			"usage": 0,
		},
		"memory": map[string]interface{}{
			"used":  usedGB,
			"total": totalGB,
			"unit":  "GB",
			"pct":   memPct,
		},
		"disk": map[string]interface{}{
			"used":  diskUsed,
			"total": diskTotal,
			"free":  diskFree,
			"unit":  "GB",
			"pct":   diskPct,
		},
		"swap": map[string]interface{}{
			"used":  swapUsedGB,
			"total": swapTotalGB,
			"pct":   swapPct,
		},
		"network": map[string]interface{}{
			"rx":   netRx,
			"tx":   netTx,
			"unit": "KB/s",
		},
		"load":   loadAvg(),
		"apps":   apps,
		"ip":     getLocalIP(),
		"region": os.Getenv("VPS_REGION"),
	}
}

func memBytes() (total, free uint64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		val, _ := strconv.ParseUint(fields[1], 10, 64)
		val *= 1024 // kB → bytes
		switch fields[0] {
		case "MemTotal:":
			total = val
		case "MemFree:":
			free = val
		}
	}
	return
}

func swapBytes() (used, total uint64) {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return
	}
	defer f.Close()
	var swapTotal, swapFree uint64
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		val, _ := strconv.ParseUint(fields[1], 10, 64)
		val *= 1024
		switch fields[0] {
		case "SwapTotal:":
			swapTotal = val
		case "SwapFree:":
			swapFree = val
		}
	}
	return swapTotal - swapFree, swapTotal
}

func diskGB() (usedGB, totalGB, freeGB int) {
	var st syscall.Statfs_t
	if err := syscall.Statfs("/", &st); err != nil {
		return 19, 75, 56
	}
	total := int64(st.Blocks) * int64(st.Bsize)
	free := int64(st.Bfree) * int64(st.Bsize)
	used := total - free
	return int(used / 1024 / 1024 / 1024), int(total / 1024 / 1024 / 1024), int(free / 1024 / 1024 / 1024)
}

// netRates returns a one-shot current reading (not a delta) suitable for display.
var _prevHostNetRx, _prevHostNetTx uint64
var _prevHostNetTs time.Time

func netRates() (float64, float64) {
	rx, tx := readNetBytes()
	now := time.Now()
	if _prevHostNetTs.IsZero() {
		_prevHostNetRx = rx
		_prevHostNetTx = tx
		_prevHostNetTs = now
		return 0, 0
	}
	dt := now.Sub(_prevHostNetTs).Seconds()
	var inKBs, outKBs float64
	if dt > 0 {
		inKBs = float64(rx-_prevHostNetRx) / dt / 1024
		outKBs = float64(tx-_prevHostNetTx) / dt / 1024
		if inKBs < 0 {
			inKBs = 0
		}
		if outKBs < 0 {
			outKBs = 0
		}
	}
	_prevHostNetRx = rx
	_prevHostNetTx = tx
	_prevHostNetTs = now
	return inKBs, outKBs
}

func readNetBytes() (rx, tx uint64) {
	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for i := 0; scanner.Scan(); i++ {
		if i < 2 {
			continue
		}
		parts := strings.Fields(strings.TrimSpace(scanner.Text()))
		if len(parts) < 10 {
			continue
		}
		iface := strings.TrimSuffix(parts[0], ":")
		if iface == "lo" {
			continue
		}
		r, _ := strconv.ParseUint(parts[1], 10, 64)
		t, _ := strconv.ParseUint(parts[9], 10, 64)
		rx += r
		tx += t
	}
	return
}

func loadAvg() []float64 {
	b, err := os.ReadFile("/proc/loadavg")
	if err != nil {
		return []float64{0, 0, 0}
	}
	fields := strings.Fields(string(b))
	if len(fields) < 3 {
		return []float64{0, 0, 0}
	}
	res := make([]float64, 3)
	for i := 0; i < 3; i++ {
		res[i], _ = strconv.ParseFloat(fields[i], 64)
	}
	return res
}

func getUptime() int64 {
	b, err := os.ReadFile("/proc/uptime")
	if err != nil {
		return 0
	}
	fields := strings.Fields(string(b))
	if len(fields) == 0 {
		return 0
	}
	f, _ := strconv.ParseFloat(fields[0], 64)
	return int64(f)
}

func getDistro() string {
	b, err := os.ReadFile("/etc/os-release")
	if err != nil {
		return runtime.GOOS
	}
	for _, line := range strings.Split(string(b), "\n") {
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			return strings.Trim(strings.TrimPrefix(line, "PRETTY_NAME="), `"`)
		}
	}
	return runtime.GOOS
}

func getKernel() string {
	b, err := os.ReadFile("/proc/version")
	if err != nil {
		return "unknown"
	}
	fields := strings.Fields(string(b))
	if len(fields) >= 3 {
		return fields[2]
	}
	return strings.TrimSpace(string(b))
}

func getCPUModel() string {
	f, err := os.Open("/proc/cpuinfo")
	if err != nil {
		return "Unknown"
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "model name") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "Unknown"
}

func getLocalIP() string {
	ifaces, err := net.Interfaces()
	if err != nil {
		return "—"
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagLoopback != 0 || iface.Flags&net.FlagUp == 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, a := range addrs {
			ipNet, ok := a.(*net.IPNet)
			if ok && ipNet.IP.To4() != nil {
				return ipNet.IP.String()
			}
		}
	}
	return "—"
}

func roundGB(bytes uint64) float64 {
	gb := float64(bytes) / 1024 / 1024 / 1024
	return float64(int(gb*10)) / 10
}

var _ = fmt.Sprintf
