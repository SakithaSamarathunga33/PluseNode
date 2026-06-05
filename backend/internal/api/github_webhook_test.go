package api

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func sign(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestValidSignature(t *testing.T) {
	secret := "topsecret"
	body := []byte(`{"ref":"refs/heads/main"}`)
	good := sign(secret, body)

	cases := []struct {
		name   string
		secret string
		header string
		body   []byte
		want   bool
	}{
		{"valid", secret, good, body, true},
		{"wrong secret", "other", good, body, false},
		{"tampered body", secret, good, []byte(`{"ref":"refs/heads/evil"}`), false},
		{"missing prefix", secret, hex.EncodeToString([]byte("x")), body, false},
		{"empty header", secret, "", body, false},
		{"not hex", secret, "sha256=zzzz", body, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := validSignature(c.secret, c.header, c.body); got != c.want {
				t.Fatalf("validSignature = %v, want %v", got, c.want)
			}
		})
	}
}

func TestSplitFullName(t *testing.T) {
	cases := []struct {
		in              string
		owner, repo     string
		ok              bool
	}{
		{"octocat/hello", "octocat", "hello", true},
		{"a/b/c", "a", "b/c", true},
		{"noslash", "", "", false},
		{"/repo", "", "", false},
		{"owner/", "", "", false},
	}
	for _, c := range cases {
		owner, repo, ok := splitFullName(c.in)
		if owner != c.owner || repo != c.repo || ok != c.ok {
			t.Errorf("splitFullName(%q) = (%q,%q,%v), want (%q,%q,%v)", c.in, owner, repo, ok, c.owner, c.repo, c.ok)
		}
	}
}

func TestFirstLine(t *testing.T) {
	if got := firstLine("subject\n\nbody"); got != "subject" {
		t.Errorf("firstLine = %q", got)
	}
	if got := firstLine("oneline"); got != "oneline" {
		t.Errorf("firstLine = %q", got)
	}
}
