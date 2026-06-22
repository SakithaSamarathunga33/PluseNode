package builder

import (
	"os"
	"path/filepath"
)

type Method string

const (
	MethodCompose    Method = "compose"
	MethodDockerfile Method = "dockerfile"
	MethodNixpacks   Method = "nixpacks"
)

// Detect returns the build method for a cloned repo directory.
// Priority: docker-compose.yml > Dockerfile > nixpacks
func Detect(dir string) Method {
	for _, name := range []string{"docker-compose.yml", "docker-compose.yaml"} {
		if fileExists(dir + "/" + name) {
			return MethodCompose
		}
	}
	if fileExists(dir + "/Dockerfile") {
		return MethodDockerfile
	}
	return MethodNixpacks
}

// DetectMonorepo reports a frontend/ + backend/ split: true only when BOTH a
// frontend/ and backend/ directory exist at the repo root and each is
// independently buildable. The returned paths are absolute (under root).
func DetectMonorepo(root string) (frontendDir, backendDir string, ok bool) {
	fe := filepath.Join(root, "frontend")
	be := filepath.Join(root, "backend")
	if buildableDir(fe) && buildableDir(be) {
		return fe, be, true
	}
	return "", "", false
}

// buildableProjectFiles are the markers that mean a directory can be built on
// its own (Dockerfile, or a recognised package manifest for the languages
// nixpacks supports).
var buildableProjectFiles = []string{
	"Dockerfile",
	"package.json", // node
	"go.mod",       // go
	"requirements.txt", "pyproject.toml", "Pipfile", // python
	"Gemfile",     // ruby
	"Cargo.toml",  // rust
	"composer.json", // php
}

// buildableDir reports whether dir is a directory containing at least one
// recognised build marker.
func buildableDir(dir string) bool {
	fi, err := os.Stat(dir)
	if err != nil || !fi.IsDir() {
		return false
	}
	for _, f := range buildableProjectFiles {
		if fileExists(filepath.Join(dir, f)) {
			return true
		}
	}
	return false
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
