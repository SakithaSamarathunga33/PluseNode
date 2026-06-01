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
