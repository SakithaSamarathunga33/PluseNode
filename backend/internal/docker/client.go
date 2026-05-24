package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"time"
)

type Client struct{ http *http.Client }

type portBinding struct { PrivatePort int `json:"PrivatePort"`; PublicPort int `json:"PublicPort"`; Type string `json:"Type"` }

type Container struct { ID string `json:"id"`; Name string `json:"name"`; Image string `json:"image"`; State string `json:"state"`; Uptime string `json:"uptime"`; CPU int `json:"cpu"`; RAM int `json:"ram"`; Ports string `json:"ports"`; Created string `json:"created"`; Node string `json:"node"` }
type Image struct { Repo string `json:"repo"`; Tag string `json:"tag"`; ID string `json:"id"`; Size string `json:"size"`; Created string `json:"created"`; Used int `json:"used"`; Layers int `json:"layers"`; Vulns map[string]int `json:"vulns"` }
type Network struct { Name string `json:"name"`; Driver string `json:"driver"`; Scope string `json:"scope"`; Subnet string `json:"subnet"`; Gateway string `json:"gateway"`; Containers int `json:"containers"`; Attachable bool `json:"attachable"`; Internal bool `json:"internal"` }
type Database struct { Name string `json:"name"`; ContainerID string `json:"containerId"`; Engine string `json:"engine"`; Version string `json:"version"`; Host string `json:"host"`; Port int `json:"port"`; Size string `json:"size"`; Conns int `json:"conns"`; MaxConns int `json:"maxConns"`; QPS int `json:"qps"`; Slow int `json:"slow"`; State string `json:"state"` }
type Stat struct { ContainerID string `json:"containerId"`; CPU float64 `json:"cpu"`; RAM float64 `json:"ram"` }

func New() (*Client, error) {
	transport := &http.Transport{DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) { return (&net.Dialer{}).DialContext(ctx, "unix", "/var/run/docker.sock") }}
	c := &Client{http: &http.Client{Transport: transport, Timeout: 30 * time.Second}}
	var ping bytes.Buffer
	if err := c.doRaw(context.Background(), http.MethodGet, "/_ping", nil, &ping); err != nil { return nil, err }
	return c, nil
}

func (c *Client) Containers(ctx context.Context) ([]Container, error) {
	var raw []struct { ID string `json:"Id"`; Names []string `json:"Names"`; Image string `json:"Image"`; State string `json:"State"`; Status string `json:"Status"`; Created int64 `json:"Created"`; Ports []portBinding `json:"Ports"` }
	if err := c.do(ctx, http.MethodGet, "/containers/json?all=true", nil, &raw); err != nil { return nil, err }
	out := make([]Container, 0, len(raw))
	for _, item := range raw { name := ""; if len(item.Names)>0 { name = strings.TrimPrefix(item.Names[0], "/") }; out = append(out, Container{ID: shortID(item.ID), Name: name, Image: item.Image, State: item.State, Uptime: item.Status, Ports: formatPorts(item.Ports), Created: time.Unix(item.Created,0).Format("Jan 2"), Node: "primary"}) }
	return out, nil
}

func (c *Client) Images(ctx context.Context) ([]Image, error) {
	var raw []struct { ID string `json:"Id"`; RepoTags []string `json:"RepoTags"`; Size int64 `json:"Size"`; Created int64 `json:"Created"` }
	if err := c.do(ctx, http.MethodGet, "/images/json", nil, &raw); err != nil { return nil, err }
	out := make([]Image, 0, len(raw))
	for _, item := range raw { repo, tag := "<none>", "latest"; if len(item.RepoTags)>0 { parts := strings.SplitN(item.RepoTags[0], ":", 2); repo = parts[0]; if len(parts)==2 { tag = parts[1] } }; out = append(out, Image{Repo: repo, Tag: tag, ID: shortID(strings.TrimPrefix(item.ID,"sha256:")), Size: fmt.Sprintf("%d MB", item.Size/1024/1024), Created: time.Unix(item.Created,0).Format("Jan 2"), Vulns: map[string]int{"crit":0,"high":0,"med":0,"low":0}}) }
	return out, nil
}

func (c *Client) Networks(ctx context.Context) ([]Network, error) {
	var raw []struct { Name string `json:"Name"`; Driver string `json:"Driver"`; Scope string `json:"Scope"`; Attachable bool `json:"Attachable"`; Internal bool `json:"Internal"`; Containers map[string]any `json:"Containers"`; IPAM struct{ Config []struct{ Subnet string `json:"Subnet"`; Gateway string `json:"Gateway"` } `json:"Config"` } `json:"IPAM"` }
	if err := c.do(ctx, http.MethodGet, "/networks", nil, &raw); err != nil { return nil, err }
	out := make([]Network, 0, len(raw))
	for _, item := range raw { subnet, gateway := "-", "-"; if len(item.IPAM.Config)>0 { subnet = item.IPAM.Config[0].Subnet; gateway = item.IPAM.Config[0].Gateway }; out = append(out, Network{Name:item.Name, Driver:item.Driver, Scope:item.Scope, Subnet:subnet, Gateway:gateway, Containers:len(item.Containers), Attachable:item.Attachable, Internal:item.Internal}) }
	return out, nil
}

func (c *Client) DatabaseContainers(ctx context.Context) ([]Database, error) { containers, err := c.Containers(ctx); if err != nil { return nil, err }; re := regexp.MustCompile(`(?i)postgres|mysql|mariadb|redis|mongo|clickhouse|cassandra|elasticsearch`); out := []Database{}; for _, ctr := range containers { if !re.MatchString(ctr.Image) { continue }; engine, port, max := dbMeta(ctr.Image); state := "error"; if ctr.State=="running" { state="ok" }; out = append(out, Database{Name:ctr.Name, ContainerID:ctr.ID, Engine:engine, Version:imageVersion(ctr.Image), Host:ctr.Name, Port:port, Size:"-", MaxConns:max, State:state}) }; return out, nil }
func (c *Client) Logs(ctx context.Context, id string, tail int) (string, error) { var buf bytes.Buffer; err := c.doRaw(ctx, http.MethodGet, fmt.Sprintf("/containers/%s/logs?stdout=true&stderr=true&timestamps=true&tail=%d", id, tail), nil, &buf); return cleanDockerStream(buf.Bytes()), err }
func (c *Client) Action(ctx context.Context, id string, action string) error { switch action { case "restart": return c.do(ctx, http.MethodPost, "/containers/"+id+"/restart", nil, nil); case "start": return c.do(ctx, http.MethodPost, "/containers/"+id+"/start", nil, nil); case "stop": return c.do(ctx, http.MethodPost, "/containers/"+id+"/stop", nil, nil); case "remove": return c.do(ctx, http.MethodDelete, "/containers/"+id+"?force=true", nil, nil); default: return fmt.Errorf("unknown docker action %q", action) } }
func (c *Client) Exec(ctx context.Context, id string, cmd string) (string, error) { var created struct{ ID string `json:"Id"` }; if err := c.do(ctx, http.MethodPost, "/containers/"+id+"/exec", map[string]any{"Cmd":[]string{"sh","-c",cmd},"AttachStdout":true,"AttachStderr":true}, &created); err != nil { return "", err }; var buf bytes.Buffer; err := c.doRaw(ctx, http.MethodPost, "/exec/"+created.ID+"/start", map[string]any{"Detach":false,"Tty":false}, &buf); return cleanDockerStream(buf.Bytes()), err }
func (c *Client) PruneBuildCache(ctx context.Context) (uint64, error) { var raw struct{ SpaceReclaimed uint64 `json:"SpaceReclaimed"` }; err := c.do(ctx, http.MethodPost, "/build/prune", map[string]any{}, &raw); return raw.SpaceReclaimed, err }
func (c *Client) ContainerStats(ctx context.Context) ([]Stat, error) {
	containers, err := c.Containers(ctx)
	if err != nil {
		return nil, err
	}
	type result struct {
		stat Stat
		err  error
	}
	ch := make(chan result, len(containers))
	for _, ctr := range containers {
		if ctr.State != "running" {
			continue
		}
		go func(id string) {
			s, e := c.fetchOneStat(ctx, id)
			ch <- result{stat: s, err: e}
		}(ctr.ID)
	}
	running := 0
	for _, ctr := range containers {
		if ctr.State == "running" {
			running++
		}
	}
	out := make([]Stat, 0, running)
	for i := 0; i < running; i++ {
		r := <-ch
		if r.err == nil {
			out = append(out, r.stat)
		}
	}
	return out, nil
}

func (c *Client) fetchOneStat(ctx context.Context, id string) (Stat, error) {
	var raw struct {
		ID     string `json:"id"`
		CPUSt  struct {
			Usage struct {
				Total  uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
			OnlineCPUs  int    `json:"online_cpus"`
		} `json:"cpu_stats"`
		PreCPUSt struct {
			Usage struct {
				Total  uint64 `json:"total_usage"`
			} `json:"cpu_usage"`
			SystemUsage uint64 `json:"system_cpu_usage"`
			OnlineCPUs  int    `json:"online_cpus"`
		} `json:"precpu_stats"`
		MemSt struct {
			Usage uint64 `json:"usage"`
			Limit uint64 `json:"limit"`
			Cache uint64 `json:"cache"`
			Stats struct {
				Cache uint64 `json:"cache"`
			} `json:"stats"`
		} `json:"memory_stats"`
	}
	statCtx, cancel := context.WithTimeout(ctx, 4*time.Second)
	defer cancel()
	if err := c.do(statCtx, http.MethodGet, "/containers/"+id+"/stats?stream=false&one-shot=true", nil, &raw); err != nil {
		return Stat{}, err
	}
	// CPU %
	cpuDelta := float64(raw.CPUSt.Usage.Total) - float64(raw.PreCPUSt.Usage.Total)
	sysDelta  := float64(raw.CPUSt.SystemUsage) - float64(raw.PreCPUSt.SystemUsage)
	numCPU := raw.CPUSt.OnlineCPUs
	if numCPU == 0 {
		numCPU = 1
	}
	cpuPct := 0.0
	if sysDelta > 0 {
		cpuPct = (cpuDelta / sysDelta) * float64(numCPU) * 100.0
	}
	// RAM %
	cache := raw.MemSt.Stats.Cache
	if cache == 0 {
		cache = raw.MemSt.Cache
	}
	used := raw.MemSt.Usage - cache
	ramPct := 0.0
	if raw.MemSt.Limit > 0 {
		ramPct = float64(used) / float64(raw.MemSt.Limit) * 100.0
	}
	shortid := id
	if len(shortid) > 12 {
		shortid = shortid[:12]
	}
	return Stat{ContainerID: shortid, CPU: cpuPct, RAM: ramPct}, nil
}

func (c *Client) do(ctx context.Context, method, path string, body any, out any) error { var buf io.Reader; if body != nil { data, _ := json.Marshal(body); buf = bytes.NewReader(data) }; req, err := http.NewRequestWithContext(ctx, method, "http://docker"+path, buf); if err != nil { return err }; if body != nil { req.Header.Set("Content-Type", "application/json") }; res, err := c.http.Do(req); if err != nil { return err }; defer res.Body.Close(); if res.StatusCode >= 400 { data, _ := io.ReadAll(res.Body); return fmt.Errorf("docker %s %s: %s", method, path, strings.TrimSpace(string(data))) }; if out == nil { io.Copy(io.Discard, res.Body); return nil }; return json.NewDecoder(res.Body).Decode(out) }
func (c *Client) doRaw(ctx context.Context, method, path string, body any, out io.Writer) error { var buf io.Reader; if body != nil { data, _ := json.Marshal(body); buf = bytes.NewReader(data) }; req, err := http.NewRequestWithContext(ctx, method, "http://docker"+path, buf); if err != nil { return err }; if body != nil { req.Header.Set("Content-Type", "application/json") }; res, err := c.http.Do(req); if err != nil { return err }; defer res.Body.Close(); if res.StatusCode >= 400 { data, _ := io.ReadAll(res.Body); return fmt.Errorf("docker %s %s: %s", method, path, strings.TrimSpace(string(data))) }; _, err = io.Copy(out, res.Body); return err }

func formatPorts(ports []portBinding) string {
	seen := map[string]bool{}
	values := []string{}
	for _, p := range ports {
		var s string
		if p.PublicPort > 0 {
			s = fmt.Sprintf("%d→%d/%s", p.PublicPort, p.PrivatePort, p.Type)
		} else if p.PrivatePort > 0 {
			s = fmt.Sprintf("%d/%s", p.PrivatePort, p.Type)
		}
		if s != "" && !seen[s] {
			seen[s] = true
			values = append(values, s)
		}
	}
	if len(values) == 0 {
		return "-"
	}
	return strings.Join(values, ", ")
}
func shortID(id string) string { if len(id)<=12 { return id }; return id[:12] }
func cleanDockerStream(buf []byte) string { var out bytes.Buffer; for len(buf)>8 && (buf[0]==1 || buf[0]==2) { size := int(buf[4])<<24|int(buf[5])<<16|int(buf[6])<<8|int(buf[7]); if len(buf)<8+size { break }; out.Write(buf[8:8+size]); buf=buf[8+size:] }; if out.Len()==0 { out.Write(buf) }; return strings.Map(func(r rune) rune { if r<32 && r!=10 && r!=9 && r!=13 { return -1 }; return r }, out.String()) }
func dbMeta(image string) (string,int,int) { lower := strings.ToLower(image); switch { case strings.Contains(lower,"mysql"), strings.Contains(lower,"mariadb"): return "mysql",3306,100; case strings.Contains(lower,"redis"): return "redis",6379,200; case strings.Contains(lower,"mongo"): return "mongodb",27017,100; case strings.Contains(lower,"clickhouse"): return "clickhouse",8123,50; case strings.Contains(lower,"cassandra"): return "cassandra",9042,100; case strings.Contains(lower,"elasticsearch"): return "elasticsearch",9200,100; default: return "postgres",5432,100 } }
func imageVersion(image string) string { parts := strings.Split(image, ":"); if len(parts)<2 || parts[1]=="" { return "latest" }; return strings.Split(parts[1], "-")[0] }

// ── Database provisioning ─────────────────────────────────────────────────────

func (c *Client) CreateVolume(ctx context.Context, name string) error {
	return c.do(ctx, http.MethodPost, "/volumes/create", map[string]any{"Name": name}, nil)
}

func (c *Client) PullImage(ctx context.Context, image string) error {
	tag := "latest"
	parts := strings.SplitN(image, ":", 2)
	ref := parts[0]
	if len(parts) == 2 {
		tag = parts[1]
	}
	path := fmt.Sprintf("/images/create?fromImage=%s&tag=%s", ref, tag)
	var buf bytes.Buffer
	return c.doRaw(ctx, http.MethodPost, path, nil, &buf)
}

func (c *Client) CreateDBContainer(ctx context.Context, image, name, volumeName, dataPath string, hostPort, containerPort int, envVars map[string]string) (string, error) {
	env := []string{}
	for k, v := range envVars {
		env = append(env, k+"="+v)
	}
	body := map[string]any{
		"Image":   image,
		"Env":     env,
		"Labels":  map[string]string{"pulsenode.managed": "true", "pulsenode.type": "database"},
		"Volumes": map[string]any{dataPath: map[string]any{}},
		"HostConfig": map[string]any{
			"Binds":         []string{volumeName + ":" + dataPath},
			"RestartPolicy": map[string]string{"Name": "unless-stopped"},
			"PortBindings": map[string]any{
				fmt.Sprintf("%d/tcp", containerPort): []map[string]string{
					{"HostIp": "127.0.0.1", "HostPort": fmt.Sprintf("%d", hostPort)},
				},
			},
		},
		"ExposedPorts": map[string]any{fmt.Sprintf("%d/tcp", containerPort): map[string]any{}},
	}
	var created struct {
		ID string `json:"Id"`
	}
	if err := c.do(ctx, http.MethodPost, "/containers/create?name="+name, body, &created); err != nil {
		return "", err
	}
	return created.ID, nil
}

func (c *Client) StartContainer(ctx context.Context, id string) error {
	return c.do(ctx, http.MethodPost, "/containers/"+id+"/start", nil, nil)
}
