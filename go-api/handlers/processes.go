package handlers

import (
	"net/http"
	"strconv"
	"syscall"
)

type ProcessHandler struct{}

func NewProcessHandler() *ProcessHandler { return &ProcessHandler{} }

func (h *ProcessHandler) Kill(w http.ResponseWriter, r *http.Request) {
	h.signal(w, r, syscall.SIGKILL)
}

func (h *ProcessHandler) Suspend(w http.ResponseWriter, r *http.Request) {
	h.signal(w, r, syscall.SIGSTOP)
}

func (h *ProcessHandler) Resume(w http.ResponseWriter, r *http.Request) {
	h.signal(w, r, syscall.SIGCONT)
}

func (h *ProcessHandler) signal(w http.ResponseWriter, r *http.Request, sig syscall.Signal) {
	pid, err := strconv.Atoi(r.PathValue("pid"))
	if err != nil || pid < 2 {
		writeErr(w, 400, "invalid pid")
		return
	}
	if err := syscall.Kill(pid, sig); err != nil {
		writeErr(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, map[string]interface{}{"ok": true, "pid": pid, "signal": sig.String()})
}
