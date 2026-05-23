// Package hub manages SSE client registrations and message broadcasting.
package hub

import "sync"

// Message is an SSE event with a named event type and JSON payload.
type Message struct {
	Event string
	Data  []byte
}

// Client represents a single SSE connection.
type Client struct {
	Send chan Message
}

// Hub distributes messages to all registered SSE clients.
type Hub struct {
	mu      sync.RWMutex
	clients map[*Client]struct{}
}

func New() *Hub {
	return &Hub{clients: make(map[*Client]struct{})}
}

// Subscribe registers a new client and returns it.
func (h *Hub) Subscribe() *Client {
	c := &Client{Send: make(chan Message, 8)}
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
	return c
}

// Unsubscribe removes a client and closes its channel.
func (h *Hub) Unsubscribe(c *Client) {
	h.mu.Lock()
	if _, ok := h.clients[c]; ok {
		delete(h.clients, c)
		close(c.Send)
	}
	h.mu.Unlock()
}

// Broadcast sends a message to every connected client.
// Slow clients that can't keep up are dropped (non-blocking send).
func (h *Hub) Broadcast(m Message) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.clients {
		select {
		case c.Send <- m:
		default:
			// client too slow — skip this frame
		}
	}
}

// Count returns the number of connected clients.
func (h *Hub) Count() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.clients)
}

// Run is a no-op placeholder kept for API compatibility.
// The hub's operations are all synchronised with the mutex.
func (h *Hub) Run() {}
