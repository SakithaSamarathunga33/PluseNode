package hub

import (
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type Hub struct {
	mu      sync.RWMutex
	clients map[chan Event]struct{}
	ws      map[*websocket.Conn]struct{}
}

func New() *Hub {
	return &Hub{clients: map[chan Event]struct{}{}, ws: map[*websocket.Conn]struct{}{}}
}

func (h *Hub) Broadcast(kind string, data any) {
	event := Event{Type: kind, Data: data}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for client := range h.clients {
		select {
		case client <- event:
		default:
		}
	}
	for conn := range h.ws {
		_ = conn.WriteJSON(event)
	}
}

func (h *Hub) Subscribe() chan Event {
	ch := make(chan Event, 32)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) Unsubscribe(ch chan Event) {
	h.mu.Lock()
	delete(h.clients, ch)
	h.mu.Unlock()
	close(ch)
}

func (h *Hub) ServeSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}

	ch := make(chan Event, 16)
	h.mu.Lock()
	h.clients[ch] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.clients, ch)
		h.mu.Unlock()
		close(ch)
	}()

	_, _ = fmt.Fprint(w, ": connected\n\n")
	flusher.Flush()

	heartbeat := time.NewTicker(25 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-heartbeat.C:
			_, _ = fmt.Fprint(w, ": heartbeat\n\n")
			flusher.Flush()
		case event := <-ch:
			payload, _ := json.Marshal(event.Data)
			_, _ = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Type, payload)
			flusher.Flush()
		}
	}
}

func (h *Hub) ServeWebSocket(w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(*http.Request) bool { return true },
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	h.mu.Lock()
	h.ws[conn] = struct{}{}
	h.mu.Unlock()
	defer func() {
		h.mu.Lock()
		delete(h.ws, conn)
		h.mu.Unlock()
		_ = conn.Close()
	}()

	_ = conn.WriteJSON(Event{Type: "alert:count", Data: 0})
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			return
		}
	}
}
