package docker

import (
	"bytes"
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Client talks to Docker via the Unix socket using plain HTTP.
type Client struct {
	http    *http.Client
	baseURL string
	mock    bool
}

func NewClient() *Client {
	return &Client{
		http: &http.Client{
			Timeout: 30 * time.Second,
			Transport: &http.Transport{
				DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
					return (&net.Dialer{Timeout: 5 * time.Second}).DialContext(ctx, "unix", "/var/run/docker.sock")
				},
			},
		},
		baseURL: "http://localhost",
	}
}

func (c *Client) SetMock(m bool) { c.mock = m }
func (c *Client) IsMock() bool   { return c.mock }

func (c *Client) Ping(ctx context.Context) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/_ping", nil)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (c *Client) get(path string) ([]byte, error) {
	resp, err := c.http.Get(c.baseURL + path)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("docker api %s: %s", path, strings.TrimSpace(string(b)))
	}
	return b, err
}

func (c *Client) post(path string, body io.Reader) ([]byte, error) {
	resp, err := c.http.Post(c.baseURL+path, "application/json", body)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("docker api POST %s: %s", path, strings.TrimSpace(string(b)))
	}
	return b, nil
}

func (c *Client) del(path string) error {
	req, _ := http.NewRequest(http.MethodDelete, c.baseURL+path, nil)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

// ── Container types ───────────────────────────────────────────────────────────

type Container struct {
	ID              string            `json:"Id"`
	Names           []string          `json:"Names"`
	Image           string            `json:"Image"`
	State           string            `json:"State"`
	Status          string            `json:"Status"`
	Created         int64             `json:"Created"`
	Labels          map[string]string `json:"Labels"`
	NetworkSettings struct {
		Networks map[string]NetworkEndpoint `json:"Networks"`
	} `json:"NetworkSettings"`
	Ports []Port `json:"Ports"`
}

type Port struct {
	PrivatePort int    `json:"PrivatePort"`
	PublicPort  int    `json:"PublicPort"`
	Type        string `json:"Type"`
}

type NetworkEndpoint struct {
	IPAddress string `json:"IPAddress"`
}

type ContainerInspect struct {
	ID   string `json:"Id"`
	Name string `json:"Name"`
	Config struct {
		Image string   `json:"Image"`
		Env   []string `json:"Env"`
	} `json:"Config"`
	NetworkSettings struct {
		Ports    map[string][]PortBinding  `json:"Ports"`
		Networks map[string]NetworkEndpoint `json:"Networks"`
	} `json:"NetworkSettings"`
	HostConfig struct {
		NetworkMode string `json:"NetworkMode"`
	} `json:"HostConfig"`
}

type PortBinding struct {
	HostIP   string `json:"HostIp"`
	HostPort string `json:"HostPort"`
}

type ContainerStats struct {
	CPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
		OnlineCPUs     int    `json:"online_cpus"`
	} `json:"cpu_stats"`
	PreCPUStats struct {
		CPUUsage struct {
			TotalUsage uint64 `json:"total_usage"`
		} `json:"cpu_usage"`
		SystemCPUUsage uint64 `json:"system_cpu_usage"`
	} `json:"precpu_stats"`
	MemoryStats struct {
		Usage uint64 `json:"usage"`
		Limit uint64 `json:"limit"`
	} `json:"memory_stats"`
}

type Image struct {
	ID       string   `json:"Id"`
	RepoTags []string `json:"RepoTags"`
	Size     int64    `json:"Size"`
	Created  int64    `json:"Created"`
	RootFS   struct {
		Layers []string `json:"Layers"`
	} `json:"RootFS"`
}

type Network struct {
	ID         string            `json:"Id"`
	Name       string            `json:"Name"`
	Driver     string            `json:"Driver"`
	Scope      string            `json:"Scope"`
	Attachable bool              `json:"Attachable"`
	Internal   bool              `json:"Internal"`
	Labels     map[string]string `json:"Labels"`
	IPAM       struct {
		Config []struct {
			Subnet  string `json:"Subnet"`
			Gateway string `json:"Gateway"`
		} `json:"Config"`
	} `json:"IPAM"`
	Containers map[string]interface{} `json:"Containers"`
}

// ── Container operations ─────────────────────────────────────────────────────

func (c *Client) ListContainers(all bool) ([]Container, error) {
	path := "/containers/json"
	if all {
		path += "?all=1"
	}
	b, err := c.get(path)
	if err != nil {
		return nil, err
	}
	var list []Container
	return list, json.Unmarshal(b, &list)
}

func (c *Client) InspectContainer(id string) (*ContainerInspect, error) {
	b, err := c.get("/containers/" + id + "/json")
	if err != nil {
		return nil, err
	}
	var ci ContainerInspect
	return &ci, json.Unmarshal(b, &ci)
}

func (c *Client) ContainerLogs(id string, tail int) (string, error) {
	path := fmt.Sprintf("/containers/%s/logs?stdout=1&stderr=1&timestamps=1&tail=%d", id, tail)
	b, err := c.get(path)
	if err != nil {
		return "", err
	}
	return demuxDockerStream(b), nil
}

func (c *Client) StartContainer(id string) error {
	_, err := c.post("/containers/"+id+"/start", nil)
	return err
}

func (c *Client) StopContainer(id string) error {
	_, err := c.post("/containers/"+id+"/stop", nil)
	return err
}

func (c *Client) RestartContainer(id string) error {
	_, err := c.post("/containers/"+id+"/restart", nil)
	return err
}

func (c *Client) RemoveContainer(id string) error {
	return c.del("/containers/" + id + "?force=1")
}

func (c *Client) GetStats(id string) (*ContainerStats, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		c.baseURL+"/containers/"+id+"/stats?stream=false", nil)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var s ContainerStats
	return &s, json.NewDecoder(resp.Body).Decode(&s)
}

func (c *Client) ExecCreate(id string, cmd []string) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"AttachStdout": true,
		"AttachStderr": true,
		"Cmd":          cmd,
	})
	b, err := c.post("/containers/"+id+"/exec", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	var resp struct {
		ID string `json:"Id"`
	}
	return resp.ID, json.Unmarshal(b, &resp)
}

func (c *Client) ExecStart(execID string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	body, _ := json.Marshal(map[string]interface{}{"Detach": false, "Tty": false})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/exec/"+execID+"/start", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return demuxDockerStream(b), nil
}

// ExecStream starts an exec and streams its stdout directly to w (for backup).
func (c *Client) ExecStream(execID string, env []string, w io.Writer) error {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()
	body, _ := json.Marshal(map[string]interface{}{"Detach": false, "Tty": false})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/exec/"+execID+"/start", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return demuxDockerStreamTo(resp.Body, w)
}

// ExecCreateWithEnv creates an exec with environment variables.
func (c *Client) ExecCreateWithEnv(id string, cmd []string, env []string) (string, error) {
	body, _ := json.Marshal(map[string]interface{}{
		"AttachStdout": true,
		"AttachStderr": false,
		"Cmd":          cmd,
		"Env":          env,
	})
	b, err := c.post("/containers/"+id+"/exec", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	var resp struct {
		ID string `json:"Id"`
	}
	return resp.ID, json.Unmarshal(b, &resp)
}

// ── Images ────────────────────────────────────────────────────────────────────

func (c *Client) ListImages() ([]Image, error) {
	b, err := c.get("/images/json")
	if err != nil {
		return nil, err
	}
	var list []Image
	return list, json.Unmarshal(b, &list)
}

func (c *Client) PullImage(image string) error {
	ref := url.QueryEscape(image)
	_, err := c.post("/images/create?fromImage="+ref, nil)
	return err
}

// ── Networks ──────────────────────────────────────────────────────────────────

func (c *Client) ListNetworks() ([]Network, error) {
	b, err := c.get("/networks")
	if err != nil {
		return nil, err
	}
	var list []Network
	return list, json.Unmarshal(b, &list)
}

func (c *Client) ConnectNetwork(networkName, containerID string) error {
	body, _ := json.Marshal(map[string]string{"Container": containerID})
	_, err := c.post("/networks/"+networkName+"/connect", bytes.NewReader(body))
	return err
}

// ── Build cache ───────────────────────────────────────────────────────────────

type PruneResult struct {
	SpaceReclaimed int64 `json:"SpaceReclaimed"`
}

func (c *Client) PruneBuilder() (*PruneResult, error) {
	b, err := c.post("/build/prune", nil)
	if err != nil {
		return nil, err
	}
	var r PruneResult
	_ = json.Unmarshal(b, &r)
	return &r, nil
}

// ── Container creation ────────────────────────────────────────────────────────

type CreateContainerConfig struct {
	Image        string
	Name         string
	Env          []string
	Cmd          []string
	ExposedPorts map[string]struct{}
	HostConfig   CreateHostConfig
}

type CreateHostConfig struct {
	PortBindings  map[string][]PortBinding
	RestartPolicy struct {
		Name string
	}
	Binds []string
}

type CreateContainerResponse struct {
	ID string `json:"Id"`
}

func (c *Client) CreateContainer(cfg CreateContainerConfig) (string, error) {
	portBindings := make(map[string][]map[string]string)
	for k, v := range cfg.HostConfig.PortBindings {
		var bindings []map[string]string
		for _, b := range v {
			bindings = append(bindings, map[string]string{"HostPort": b.HostPort})
		}
		portBindings[k] = bindings
	}

	body := map[string]interface{}{
		"Image": cfg.Image,
		"Env":   cfg.Env,
		"ExposedPorts": func() map[string]struct{} {
			if cfg.ExposedPorts != nil {
				return cfg.ExposedPorts
			}
			return map[string]struct{}{}
		}(),
		"HostConfig": map[string]interface{}{
			"PortBindings":  portBindings,
			"RestartPolicy": map[string]string{"Name": cfg.HostConfig.RestartPolicy.Name},
			"Binds":         cfg.HostConfig.Binds,
		},
	}
	if len(cfg.Cmd) > 0 {
		body["Cmd"] = cfg.Cmd
	}

	b, _ := json.Marshal(body)
	nameParam := ""
	if cfg.Name != "" {
		nameParam = "?name=" + cfg.Name
	}
	resp, err := c.post("/containers/create"+nameParam, bytes.NewReader(b))
	if err != nil {
		return "", err
	}
	var r CreateContainerResponse
	return r.ID, json.Unmarshal(resp, &r)
}

// ── Self-container detection ──────────────────────────────────────────────────

// SelfNetworks returns the non-bridge networks that this process's container is on.
func (c *Client) SelfNetworks() []string {
	// Only works inside Docker
	if _, err := os.Stat("/.dockerenv"); err != nil {
		return nil
	}
	hostname, _ := os.Hostname()
	ctrs, err := c.ListContainers(false)
	if err != nil {
		return nil
	}
	var self *Container
	for i := range ctrs {
		if strings.HasPrefix(ctrs[i].ID, hostname) {
			self = &ctrs[i]
			break
		}
	}
	if self == nil {
		for i := range ctrs {
			for _, n := range ctrs[i].Names {
				if strings.Contains(strings.ToLower(n), "go-api") ||
					strings.Contains(strings.ToLower(n), "pulsenode") {
					self = &ctrs[i]
					break
				}
			}
		}
	}
	if self == nil {
		return nil
	}
	var nets []string
	for name := range self.NetworkSettings.Networks {
		if name != "bridge" {
			nets = append(nets, name)
		}
	}
	return nets
}

// JoinSelfNetworks connects containerID to all networks this process's container is on.
func (c *Client) JoinSelfNetworks(containerID string) {
	for _, n := range c.SelfNetworks() {
		_ = c.ConnectNetwork(n, containerID)
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// ParseEnv converts ["KEY=val", ...] into a map.
func ParseEnv(envArr []string) map[string]string {
	m := make(map[string]string, len(envArr))
	for _, e := range envArr {
		idx := strings.Index(e, "=")
		if idx == -1 {
			continue
		}
		m[e[:idx]] = e[idx+1:]
	}
	return m
}

// ContainerIP returns the first non-bridge IP for a container.
func ContainerIP(ci *ContainerInspect) string {
	// Prefer non-bridge network
	for name, ep := range ci.NetworkSettings.Networks {
		if name != "bridge" && ep.IPAddress != "" {
			return ep.IPAddress
		}
	}
	for _, ep := range ci.NetworkSettings.Networks {
		if ep.IPAddress != "" {
			return ep.IPAddress
		}
	}
	return strings.TrimPrefix(ci.Name, "/")
}

// demuxDockerStream strips the 8-byte Docker multiplexed stream headers.
func demuxDockerStream(b []byte) string {
	var out strings.Builder
	for len(b) >= 8 {
		streamType := b[0]
		size := binary.BigEndian.Uint32(b[4:8])
		if len(b) < int(8+size) {
			break
		}
		if streamType == 1 || streamType == 2 {
			out.Write(b[8 : 8+size])
		}
		b = b[8+size:]
	}
	result := out.String()
	if result == "" {
		// Fallback: not multiplexed (tty mode)
		result = string(b)
	}
	return stripControlChars(result)
}

// demuxDockerStreamTo streams only stdout (type=1) frames to w.
func demuxDockerStreamTo(r io.Reader, w io.Writer) error {
	header := make([]byte, 8)
	for {
		if _, err := io.ReadFull(r, header); err != nil {
			if err == io.EOF || err == io.ErrUnexpectedEOF {
				return nil
			}
			return err
		}
		streamType := header[0]
		size := binary.BigEndian.Uint32(header[4:8])
		if streamType == 1 {
			if _, err := io.CopyN(w, r, int64(size)); err != nil {
				return err
			}
		} else {
			if _, err := io.CopyN(io.Discard, r, int64(size)); err != nil {
				return err
			}
		}
	}
}

func stripControlChars(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r >= 0x20 || r == '\n' || r == '\r' || r == '\t' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// FormatSize converts bytes to human-readable MB string.
func FormatSize(bytes int64) string {
	mb := float64(bytes) / 1024 / 1024
	return strconv.FormatFloat(mb, 'f', 0, 64) + " MB"
}

// FormatUptime formats seconds into "Xd Xh Xm".
func FormatUptime(seconds int64) string {
	d := seconds / 86400
	h := (seconds % 86400) / 3600
	m := (seconds % 3600) / 60
	var parts []string
	if d > 0 {
		parts = append(parts, fmt.Sprintf("%dd", d))
	}
	if h > 0 {
		parts = append(parts, fmt.Sprintf("%dh", h))
	}
	if m > 0 {
		parts = append(parts, fmt.Sprintf("%dm", m))
	}
	if len(parts) == 0 {
		return "0m"
	}
	return strings.Join(parts, " ")
}

// ── Mock data ─────────────────────────────────────────────────────────────────

var MockContainers = []Container{
	{ID: "mock000000001", Names: []string{"/nginx-proxy"}, Image: "nginx:alpine", State: "running", Status: "Up 3 days", Created: time.Now().Add(-72 * time.Hour).Unix()},
	{ID: "mock000000002", Names: []string{"/postgres-db"}, Image: "postgres:16-alpine", State: "running", Status: "Up 7 days", Created: time.Now().Add(-168 * time.Hour).Unix()},
	{ID: "mock000000003", Names: []string{"/redis-cache"}, Image: "redis:7-alpine", State: "running", Status: "Up 2 days", Created: time.Now().Add(-48 * time.Hour).Unix()},
	{ID: "mock000000004", Names: []string{"/app-worker"}, Image: "node:20-alpine", State: "exited", Status: "Exited (0) 1 hour ago", Created: time.Now().Add(-24 * time.Hour).Unix()},
}
