// Package collector samples system + Docker metrics every 2 seconds.
package collector

import (
	"bufio"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"pulsenode/api/docker"
	"pulsenode/api/hub"
)

const historySize = 60

// Metrics is the normalized snapshot pushed to clients every 2 s.
type Metrics struct {
	CPU       float64   `json:"cpu"`
	CPUCores  []float64 `json:"cpuCores"`
	RAM       float64   `json:"ram"`
	Disk      float64   `json:"disk"`
	DiskRead  float64   `json:"diskRead"`
	DiskWrite float64   `json:"diskWrite"`
	NetIn     float64   `json:"netIn"`
	NetOut    float64   `json:"netOut"`
	Timestamp int64     `json:"ts"`
}

// ContainerStat is per-container CPU + RAM sampled from Docker.
type ContainerStat struct {
	ContainerID string  `json:"containerId"`
	CPU         float64 `json:"cpu"`
	RAM         float64 `json:"ram"`
}

// Process is a single OS process.
type Process struct {
	PID    int     `json:"pid"`
	Name   string  `json:"name"`
	CPU    float64 `json:"cpu"`
	MemMB  float64 `json:"mem_mb"`
	Status string  `json:"status"`
	User   string  `json:"user"`
	Cmd    string  `json:"cmd"`
	Type   string  `json:"type"`
}

// Collector owns state for delta calculations and the ring buffer.
type Collector struct {
	dc *docker.Client

	mu      sync.RWMutex
	history []Metrics
	latest  Metrics
	procs   []Process
	cstats  []ContainerStat

	// CPU delta state
	prevCPUStat cpuStat

	// Network delta state
	prevNetRx, prevNetTx uint64
	prevNetTs            time.Time

	// Disk I/O delta state
	prevDiskRead, prevDiskWrite uint64
	prevDiskTs                  time.Time

	// Process CPU delta state (pid → (utime+stime) jiffies)
	prevProcJiffies map[int]uint64
	prevProcTs      time.Time
}

type cpuStat struct {
	total, idle uint64
	cores       []coreStat
}

type coreStat struct {
	total, idle uint64
}

func New(dc *docker.Client) *Collector {
	return &Collector{
		dc:              dc,
		history:         make([]Metrics, 0, historySize),
		prevProcJiffies: make(map[int]uint64),
	}
}

// Run is the main collector goroutine. It samples every 2s and pushes to hub.
func (c *Collector) Run(h *hub.Hub) {
	// Prime the delta state before the first real sample
	c.sampleCPUStat()
	c.sampleNetBytes()
	c.sampleDiskIO()
	c.sampleProcessJiffies()
	time.Sleep(2 * time.Second)

	metricsTicker := time.NewTicker(2 * time.Second)
	containerTicker := time.NewTicker(5 * time.Second)
	defer metricsTicker.Stop()
	defer containerTicker.Stop()

	for {
		select {
		case <-metricsTicker.C:
			m := c.sample()
			c.mu.Lock()
			c.latest = m
			if len(c.history) >= historySize {
				c.history = c.history[1:]
			}
			c.history = append(c.history, m)
			c.mu.Unlock()

			data, _ := json.Marshal(m)
			h.Broadcast(hub.Message{Event: "metrics", Data: data})

		case <-containerTicker.C:
			stats := c.sampleContainers()
			c.mu.Lock()
			c.cstats = stats
			c.mu.Unlock()
			if len(stats) > 0 {
				data, _ := json.Marshal(stats)
				h.Broadcast(hub.Message{Event: "container_stats", Data: data})
			}
		}
	}
}

// GetLatest returns the most recent metrics snapshot.
func (c *Collector) GetLatest() Metrics {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.latest
}

// GetHistory returns all accumulated history points.
func (c *Collector) GetHistory() []Metrics {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]Metrics, len(c.history))
	copy(out, c.history)
	return out
}

// GetContainerStats returns the latest per-container stats.
func (c *Collector) GetContainerStats() []ContainerStat {
	c.mu.RLock()
	defer c.mu.RUnlock()
	out := make([]ContainerStat, len(c.cstats))
	copy(out, c.cstats)
	return out
}

// GetProcesses returns top processes by CPU.
func (c *Collector) GetProcesses() []Process {
	procs := c.readProcesses()
	// Sort descending by CPU
	for i := 1; i < len(procs); i++ {
		for j := i; j > 0 && procs[j].CPU > procs[j-1].CPU; j-- {
			procs[j], procs[j-1] = procs[j-1], procs[j]
		}
	}
	if len(procs) > 50 {
		procs = procs[:50]
	}
	return procs
}

// ── Sampling ──────────────────────────────────────────────────────────────────

func (c *Collector) sample() Metrics {
	cpu, cores := c.calcCPU()
	ram := c.calcRAM()
	disk := c.calcDisk()
	netIn, netOut := c.calcNet()
	diskRead, diskWrite := c.calcDiskIO()
	return Metrics{
		CPU:       cpu,
		CPUCores:  cores,
		RAM:       ram,
		Disk:      disk,
		DiskRead:  diskRead,
		DiskWrite: diskWrite,
		NetIn:     netIn,
		NetOut:    netOut,
		Timestamp: time.Now().UnixMilli(),
	}
}

// ── CPU ───────────────────────────────────────────────────────────────────────

type rawCPUStat struct {
	total, idle uint64
}

func parseProcStat() (overall rawCPUStat, cores []rawCPUStat) {
	f, err := os.Open("/proc/stat")
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "cpu") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 5 {
			continue
		}
		vals := make([]uint64, len(fields)-1)
		for i, s := range fields[1:] {
			vals[i], _ = strconv.ParseUint(s, 10, 64)
		}
		var total uint64
		for _, v := range vals {
			total += v
		}
		idle := vals[3] // idle is index 3 (user nice system idle ...)
		if len(vals) > 4 {
			idle += vals[4] // add iowait
		}
		stat := rawCPUStat{total: total, idle: idle}
		if fields[0] == "cpu" {
			overall = stat
		} else {
			cores = append(cores, stat)
		}
	}
	return
}

func (c *Collector) sampleCPUStat() cpuStat {
	overall, rawCores := parseProcStat()
	cores := make([]coreStat, len(rawCores))
	for i, rc := range rawCores {
		cores[i] = coreStat{total: rc.total, idle: rc.idle}
	}
	return cpuStat{total: overall.total, idle: overall.idle, cores: cores}
}

func (c *Collector) calcCPU() (float64, []float64) {
	curr := c.sampleCPUStat()
	prev := c.prevCPUStat
	c.prevCPUStat = curr

	totalDiff := curr.total - prev.total
	idleDiff := curr.idle - prev.idle
	var overall float64
	if totalDiff > 0 {
		overall = round1(float64(totalDiff-idleDiff) / float64(totalDiff) * 100)
	}

	coresPct := make([]float64, len(curr.cores))
	for i, cc := range curr.cores {
		if i < len(prev.cores) {
			td := cc.total - prev.cores[i].total
			id := cc.idle - prev.cores[i].idle
			if td > 0 {
				coresPct[i] = round1(float64(td-id) / float64(td) * 100)
			}
		}
	}
	return overall, coresPct
}

// ── RAM ───────────────────────────────────────────────────────────────────────

func (c *Collector) calcRAM() float64 {
	f, err := os.Open("/proc/meminfo")
	if err != nil {
		return 0
	}
	defer f.Close()
	var total, available uint64
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Text()
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		val, _ := strconv.ParseUint(fields[1], 10, 64)
		switch fields[0] {
		case "MemTotal:":
			total = val
		case "MemAvailable:":
			available = val
		}
	}
	if total == 0 {
		return 0
	}
	return round1(float64(total-available) / float64(total) * 100)
}

// ── Disk ──────────────────────────────────────────────────────────────────────

func (c *Collector) calcDisk() float64 {
	var st syscall.Statfs_t
	if err := syscall.Statfs("/", &st); err != nil {
		return 0
	}
	total := st.Blocks * uint64(st.Bsize)
	free := st.Bfree * uint64(st.Bsize)
	if total == 0 {
		return 0
	}
	return round1(float64(total-free) / float64(total) * 100)
}

// ── Network ───────────────────────────────────────────────────────────────────

func (c *Collector) sampleNetBytes() (rx, tx uint64) {
	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for i := 0; scanner.Scan(); i++ {
		if i < 2 {
			continue // skip headers
		}
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		parts := strings.Fields(line)
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

func (c *Collector) calcNet() (inKBs, outKBs float64) {
	now := time.Now()
	rx, tx := c.sampleNetBytes()
	if !c.prevNetTs.IsZero() {
		dt := now.Sub(c.prevNetTs).Seconds()
		if dt > 0 {
			inKBs = round1(math.Max(0, float64(rx-c.prevNetRx)/dt/1024))
			outKBs = round1(math.Max(0, float64(tx-c.prevNetTx)/dt/1024))
		}
	}
	c.prevNetRx = rx
	c.prevNetTx = tx
	c.prevNetTs = now
	return
}

// ── Disk I/O ──────────────────────────────────────────────────────────────────

func (c *Collector) sampleDiskIO() (readBytes, writeBytes uint64) {
	f, err := os.Open("/proc/diskstats")
	if err != nil {
		return
	}
	defer f.Close()
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 14 {
			continue
		}
		dev := fields[2]
		// Only include physical devices (skip loop, dm, sr, etc.) by checking for sd* or nvme*
		if !strings.HasPrefix(dev, "sd") && !strings.HasPrefix(dev, "nvme") &&
			!strings.HasPrefix(dev, "vd") && !strings.HasPrefix(dev, "xvd") &&
			!strings.HasPrefix(dev, "hd") {
			continue
		}
		// sectors read (field 6, 0-indexed), sectors written (field 10)
		sr, _ := strconv.ParseUint(fields[5], 10, 64)
		sw, _ := strconv.ParseUint(fields[9], 10, 64)
		readBytes += sr * 512
		writeBytes += sw * 512
	}
	return
}

func (c *Collector) calcDiskIO() (readMBs, writeMBs float64) {
	now := time.Now()
	r, w := c.sampleDiskIO()
	if !c.prevDiskTs.IsZero() {
		dt := now.Sub(c.prevDiskTs).Seconds()
		if dt > 0 {
			readMBs = round2(math.Max(0, float64(r-c.prevDiskRead)/dt/1024/1024))
			writeMBs = round2(math.Max(0, float64(w-c.prevDiskWrite)/dt/1024/1024))
		}
	}
	c.prevDiskRead = r
	c.prevDiskWrite = w
	c.prevDiskTs = now
	return
}

// ── Container stats ───────────────────────────────────────────────────────────

func (c *Collector) sampleContainers() []ContainerStat {
	if c.dc.IsMock() {
		return []ContainerStat{
			{ContainerID: "mock000000001", CPU: 2.1, RAM: 15.4},
			{ContainerID: "mock000000002", CPU: 5.3, RAM: 38.2},
			{ContainerID: "mock000000003", CPU: 0.8, RAM: 12.1},
		}
	}
	running, err := c.dc.ListContainers(false)
	if err != nil {
		return nil
	}
	if len(running) > 12 {
		running = running[:12]
	}
	stats := make([]ContainerStat, 0, len(running))
	for _, ctr := range running {
		id := ctr.ID[:12]
		s, err := c.dc.GetStats(id)
		if err != nil || s == nil {
			stats = append(stats, ContainerStat{ContainerID: id})
			continue
		}
		cpuDelta := float64(s.CPUStats.CPUUsage.TotalUsage - s.PreCPUStats.CPUUsage.TotalUsage)
		sysDelta := float64(s.CPUStats.SystemCPUUsage - s.PreCPUStats.SystemCPUUsage)
		numCPU := s.CPUStats.OnlineCPUs
		if numCPU < 1 {
			numCPU = 1
		}
		var cpu float64
		if sysDelta > 0 {
			cpu = round1(cpuDelta / sysDelta * float64(numCPU) * 100)
		}
		var ram float64
		if s.MemoryStats.Limit > 0 {
			ram = round1(float64(s.MemoryStats.Usage) / float64(s.MemoryStats.Limit) * 100)
		}
		stats = append(stats, ContainerStat{ContainerID: id, CPU: cpu, RAM: ram})
	}
	return stats
}

// ── Processes ─────────────────────────────────────────────────────────────────

func (c *Collector) sampleProcessJiffies() map[int]uint64 {
	m := make(map[int]uint64)
	entries, _ := filepath.Glob("/proc/[0-9]*/stat")
	for _, path := range entries {
		b, err := os.ReadFile(path)
		if err != nil {
			continue
		}
		fields := strings.Fields(string(b))
		if len(fields) < 15 {
			continue
		}
		pid, _ := strconv.Atoi(fields[0])
		utime, _ := strconv.ParseUint(fields[13], 10, 64)
		stime, _ := strconv.ParseUint(fields[14], 10, 64)
		m[pid] = utime + stime
	}
	return m
}

func (c *Collector) readProcesses() []Process {
	now := time.Now()
	currentJiffies := c.sampleProcessJiffies()
	dt := now.Sub(c.prevProcTs).Seconds()
	if dt <= 0 {
		dt = 2
	}
	const clkTck = 100.0 // Hz

	entries, _ := filepath.Glob("/proc/[0-9]*/status")
	procs := make([]Process, 0, len(entries))
	for _, statusPath := range entries {
		parts := strings.Split(statusPath, "/")
		if len(parts) < 3 {
			continue
		}
		pid, err := strconv.Atoi(parts[2])
		if err != nil {
			continue
		}

		statusBytes, err := os.ReadFile(statusPath)
		if err != nil {
			continue
		}
		status := parseStatusFile(string(statusBytes))

		cmdlineBytes, _ := os.ReadFile(fmt.Sprintf("/proc/%d/cmdline", pid))
		cmd := strings.ReplaceAll(strings.TrimSpace(string(cmdlineBytes)), "\x00", " ")
		if cmd == "" {
			cmd = status["Name"]
		}
		if len(cmd) > 120 {
			cmd = cmd[:120]
		}

		vmRSS, _ := strconv.ParseUint(strings.Fields(status["VmRSS"])[0], 10, 64)
		memMB := round1(float64(vmRSS) / 1024)

		uid := strings.Fields(status["Uid"])[0]

		// CPU% from jiffies delta
		prevJ := c.prevProcJiffies[pid]
		currJ := currentJiffies[pid]
		var cpuPct float64
		if currJ >= prevJ && dt > 0 {
			cpuPct = round1(float64(currJ-prevJ) / clkTck / dt * 100)
		}

		state := status["State"]
		if len(state) > 0 {
			state = string(state[0])
		}

		procs = append(procs, Process{
			PID:    pid,
			Name:   status["Name"],
			CPU:    cpuPct,
			MemMB:  memMB,
			Status: state,
			User:   uid,
			Cmd:    cmd,
			Type:   "system",
		})
	}

	c.prevProcJiffies = currentJiffies
	c.prevProcTs = now
	return procs
}

func parseStatusFile(content string) map[string]string {
	m := make(map[string]string)
	for _, line := range strings.Split(content, "\n") {
		idx := strings.Index(line, ":")
		if idx == -1 {
			continue
		}
		key := strings.TrimSpace(line[:idx])
		val := strings.TrimSpace(line[idx+1:])
		m[key] = val
	}
	return m
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func round1(v float64) float64 {
	return math.Round(v*10) / 10
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
