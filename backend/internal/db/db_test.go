package db

import (
	"path/filepath"
	"testing"
)

func newTestDB(t *testing.T) *DB {
	t.Helper()
	d, err := Open(filepath.Join(t.TempDir(), "test.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	return d
}

func TestUpsertDomainIdempotent(t *testing.T) {
	d := newTestDB(t)
	id1, err := d.UpsertDomain("example.com")
	if err != nil {
		t.Fatalf("upsert1: %v", err)
	}
	id2, err := d.UpsertDomain("example.com")
	if err != nil {
		t.Fatalf("upsert2: %v", err)
	}
	if id1 != id2 {
		t.Fatalf("expected same id on re-upsert, got %q then %q", id1, id2)
	}
	list, err := d.ListDomains()
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 domain, got %d", len(list))
	}
	if list[0].LastPointed != nil {
		t.Fatalf("expected LastPointed nil before any check")
	}
}

func TestSetPrimaryDomainSingleWinner(t *testing.T) {
	d := newTestDB(t)
	_, _ = d.UpsertDomain("a.com")
	_, _ = d.UpsertDomain("b.com")
	if err := d.SetPrimaryDomain("a.com"); err != nil {
		t.Fatal(err)
	}
	if err := d.SetPrimaryDomain("b.com"); err != nil {
		t.Fatal(err)
	}
	primary, err := d.PrimaryDomain()
	if err != nil {
		t.Fatal(err)
	}
	if primary != "b.com" {
		t.Fatalf("expected primary b.com, got %q", primary)
	}
	list, _ := d.ListDomains()
	count := 0
	for _, dm := range list {
		if dm.IsPrimary {
			count++
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly 1 primary, got %d", count)
	}
}

func TestPrimaryDomainEmpty(t *testing.T) {
	d := newTestDB(t)
	primary, err := d.PrimaryDomain()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if primary != "" {
		t.Fatalf("expected empty primary on empty table, got %q", primary)
	}
}

func TestUpdateDomainCheckRoundTrip(t *testing.T) {
	d := newTestDB(t)
	_, _ = d.UpsertDomain("a.com")
	if err := d.UpdateDomainCheck("a.com", true, false, []string{"1.2.3.4"}, "ok", ""); err != nil {
		t.Fatal(err)
	}
	list, _ := d.ListDomains()
	if list[0].LastPointed == nil || !*list[0].LastPointed {
		t.Fatalf("expected LastPointed true")
	}
	if list[0].LastRecords != `["1.2.3.4"]` {
		t.Fatalf("expected records JSON, got %q", list[0].LastRecords)
	}
}

func TestSettingsRoundTrip(t *testing.T) {
	d := newTestDB(t)
	if v, err := d.GetSetting("missing"); err != nil || v != "" {
		t.Fatalf("GetSetting(missing) = %q, %v; want empty", v, err)
	}
	if err := d.SetSetting("k", "v1"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}
	if v, _ := d.GetSetting("k"); v != "v1" {
		t.Fatalf("GetSetting = %q, want v1", v)
	}
	// upsert overwrites
	if err := d.SetSetting("k", "v2"); err != nil {
		t.Fatalf("SetSetting upsert: %v", err)
	}
	if v, _ := d.GetSetting("k"); v != "v2" {
		t.Fatalf("GetSetting after upsert = %q, want v2", v)
	}
}

func TestDeploymentImageTagRoundTrip(t *testing.T) {
	d := newTestDB(t)
	if err := d.CreateProject(&Project{ID: "proj_1", Name: "app", RepoURL: "u", Branch: "main", Domain: "x", Status: "idle"}); err != nil {
		t.Fatalf("CreateProject: %v", err)
	}
	// Created without an image tag → empty.
	dep := &Deployment{ID: "dep_1", ProjectID: "proj_1", Status: "queued", Trigger: "manual"}
	if err := d.CreateDeployment(dep); err != nil {
		t.Fatalf("CreateDeployment: %v", err)
	}
	got, _ := d.GetDeploymentByID("dep_1")
	if got == nil || got.ImageTag != "" {
		t.Fatalf("fresh deployment ImageTag = %q, want empty", got.ImageTag)
	}
	// After a build records its image.
	if err := d.UpdateDeploymentImage("dep_1", "pn-app:abc1234"); err != nil {
		t.Fatalf("UpdateDeploymentImage: %v", err)
	}
	got, _ = d.GetDeploymentByID("dep_1")
	if got.ImageTag != "pn-app:abc1234" {
		t.Fatalf("ImageTag = %q, want pn-app:abc1234", got.ImageTag)
	}
	// A rollback deployment carries the image tag from creation.
	rb := &Deployment{ID: "dep_2", ProjectID: "proj_1", Status: "queued", Trigger: "rollback", ImageTag: "pn-app:abc1234"}
	if err := d.CreateDeployment(rb); err != nil {
		t.Fatalf("CreateDeployment rollback: %v", err)
	}
	got, _ = d.GetDeploymentByID("dep_2")
	if got.ImageTag != "pn-app:abc1234" || got.Trigger != "rollback" {
		t.Fatalf("rollback deployment = %+v", got)
	}
}
