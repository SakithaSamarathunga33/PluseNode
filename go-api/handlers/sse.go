package handlers

import (
	"fmt"
	"net/http"
	"time"

	"pulsenode/api/hub"
)

type SSEHandler struct{ h *hub.Hub }

func NewSSEHandler(h *hub.Hub) *SSEHandler { return &SSEHandler{h: h} }

// Handle upgrades the request to an SSE stream.
// Each browser tab opens exactly one connection; the hub distributes to all.
func (s *SSEHandler) Handle(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)
	flusher.Flush()

	client := s.h.Subscribe()
	defer s.h.Unsubscribe(client)

	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case msg, ok := <-client.Send:
			if !ok {
				return
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", msg.Event, msg.Data)
			flusher.Flush()
		case <-keepalive.C:
			fmt.Fprintf(w, ": keepalive\n\n")
			flusher.Flush()
		}
	}
}
