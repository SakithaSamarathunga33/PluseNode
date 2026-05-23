package handlers

import (
	"net/http"

	"pulsenode/api/collector"
)

type MetricsHandler struct{ col *collector.Collector }

func NewMetricsHandler(col *collector.Collector) *MetricsHandler {
	return &MetricsHandler{col: col}
}

func (h *MetricsHandler) Live(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, 200, h.col.GetLatest())
}

func (h *MetricsHandler) History(w http.ResponseWriter, r *http.Request) {
	hist := h.col.GetHistory()
	if hist == nil {
		hist = []collector.Metrics{}
	}
	writeJSON(w, 200, hist)
}

func (h *MetricsHandler) Processes(w http.ResponseWriter, r *http.Request) {
	procs := h.col.GetProcesses()
	if procs == nil {
		procs = []collector.Process{}
	}
	writeJSON(w, 200, procs)
}
