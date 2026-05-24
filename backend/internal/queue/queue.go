package queue

import (
	"context"
	"log"
	"os"
	"sync"
	"time"

	"pulsenode/backend/internal/builder"
	"pulsenode/backend/internal/db"
	"pulsenode/backend/internal/github"
	"pulsenode/backend/internal/hub"
)

type Queue struct {
	db   *db.DB
	hub  *hub.Hub
	jobs chan string
	wg   sync.WaitGroup
}

func New(database *db.DB, events *hub.Hub, workers int) *Queue {
	if workers <= 0 {
		workers = 2
	}
	q := &Queue{db: database, hub: events, jobs: make(chan string, 64)}
	for i := 0; i < workers; i++ {
		q.wg.Add(1)
		go q.worker()
	}
	return q
}

func (q *Queue) Enqueue(deploymentID string) {
	q.jobs <- deploymentID
}

// RecoverStuck re-queues deployments left in queued/building state from a crash.
func (q *Queue) RecoverStuck() {
	deps, err := q.db.GetQueuedDeployments()
	if err != nil {
		log.Printf("[queue] recover: %v", err)
		return
	}
	for _, d := range deps {
		log.Printf("[queue] recovering deployment %s", d.ID)
		q.jobs <- d.ID
	}
}

func (q *Queue) worker() {
	defer q.wg.Done()
	for depID := range q.jobs {
		q.runDeployment(depID)
	}
}

func (q *Queue) runDeployment(depID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	emit := func(stream, line string) {
		_ = q.db.AppendLog(depID, stream, line)
		q.hub.Broadcast("deploy:log", map[string]any{
			"deploymentId": depID,
			"stream":       stream,
			"line":         line,
			"ts":           time.Now().Format(time.RFC3339),
		})
	}

	now := time.Now()
	_ = q.db.UpdateDeploymentStatus(depID, "building", &now, nil)

	dep, err := q.db.GetDeploymentByID(depID)
	if err != nil || dep == nil {
		emit("system", "✕ Deployment record not found")
		return
	}

	proj, err := q.db.GetProject(dep.ProjectID)
	if err != nil || proj == nil {
		emit("system", "✕ Project not found")
		_ = q.db.UpdateDeploymentStatus(depID, "failed", &now, timePtr(time.Now()))
		_ = q.db.UpdateProjectStatus(dep.ProjectID, "failed", "")
		return
	}

	token := ""
	if acct, _ := q.db.GetGitHubAccount(); acct != nil {
		token = acct.AccessToken
	}

	containerID, buildErr := builder.Run(ctx, builder.Config{
		DeploymentID: depID,
		ProjectID:    proj.ID,
		ProjectName:  proj.Name,
		RepoURL:      github.AuthorisedCloneURL(proj.RepoURL, token),
		Branch:       proj.Branch,
		Method:       builder.Method(proj.BuildMethod),
		BuildCommand: proj.BuildCommand,
		Port:         proj.Port,
		Domain:       proj.Domain,
		EnvVars:      proj.EnvVars,
		TraefikNet:   os.Getenv("TRAEFIK_NETWORK"),
		Log:          emit,
	})

	finishedAt := time.Now()
	if buildErr != nil {
		emit("system", "✕ Build failed: "+buildErr.Error())
		_ = q.db.UpdateDeploymentStatus(depID, "failed", &now, &finishedAt)
		_ = q.db.UpdateProjectStatus(proj.ID, "failed", "")
		return
	}

	_ = q.db.UpdateDeploymentStatus(depID, "success", &now, &finishedAt)
	_ = q.db.UpdateProjectStatus(proj.ID, "running", containerID)
	emit("system", "=== Deployment Successful ===")
}

func timePtr(t time.Time) *time.Time { return &t }
