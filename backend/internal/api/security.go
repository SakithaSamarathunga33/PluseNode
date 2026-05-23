package api

import "net/http"

func (s *Server) securityScans(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.security.Scans())
}

func (s *Server) securityScan(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Target string `json:"target"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Target == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "target is required"})
		return
	}
	result, err := s.security.Scan(r.Context(), body.Target)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *Server) securitySBOMs(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, s.security.SBOMs())
}

func (s *Server) securitySBOM(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Target string `json:"target"`
		Format string `json:"format"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Target == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "target is required"})
		return
	}
	result, err := s.security.SBOM(r.Context(), body.Target, body.Format)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
