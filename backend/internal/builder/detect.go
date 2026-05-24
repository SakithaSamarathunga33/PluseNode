package builder

import "os"

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

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}
