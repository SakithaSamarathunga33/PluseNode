// Package store persists custom database connections to a JSON file.
package store

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const connectionsFile = "/app/data/connections.json"

// Connection is a saved external database connection.
type Connection struct {
	ID               string `json:"id"`
	ConnectionString string `json:"connectionString"`
	Name             string `json:"name,omitempty"`
	Engine           string `json:"engine"`
	Host             string `json:"host"`
	Port             int    `json:"port"`
	Version          string `json:"version,omitempty"`
	AddedAt          string `json:"addedAt"`
}

var mu sync.Mutex

func load() []Connection {
	b, err := os.ReadFile(connectionsFile)
	if err != nil {
		return []Connection{}
	}
	var list []Connection
	if err := json.Unmarshal(b, &list); err != nil {
		return []Connection{}
	}
	return list
}

func save(list []Connection) error {
	if err := os.MkdirAll(filepath.Dir(connectionsFile), 0755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(connectionsFile, b, 0644)
}

func List() []Connection {
	mu.Lock()
	defer mu.Unlock()
	return load()
}

func Add(c Connection) (Connection, error) {
	mu.Lock()
	defer mu.Unlock()
	list := load()
	c.ID = newUUID()
	c.AddedAt = time.Now().UTC().Format(time.RFC3339)
	list = append(list, c)
	return c, save(list)
}

func Remove(id string) error {
	mu.Lock()
	defer mu.Unlock()
	list := load()
	filtered := list[:0]
	for _, c := range list {
		if c.ID != id {
			filtered = append(filtered, c)
		}
	}
	return save(filtered)
}

func newUUID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[:4], b[4:6], b[6:8], b[8:10], b[10:])
}
