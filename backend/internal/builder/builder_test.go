package builder

import "testing"

func TestShortID(t *testing.T) {
	cases := []struct{ in, want string }{
		{"dep_0123456789abcdef", "89abcdef"}, // trailing 8 of the hex part
		{"dep_abc", "abc"},                   // shorter than 8 → as-is
		{"plain12345", "ain12345"},           // no prefix, len 10 → trailing 8
		{"", ""},
	}
	for _, c := range cases {
		if got := shortID(c.in); got != c.want {
			t.Errorf("shortID(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestSanitizeName(t *testing.T) {
	cases := map[string]string{
		"My App":        "my-app",
		"weird@@name!!":  "weird--name",
		"---":           "app",
		"Good-Name123":  "good-name123",
	}
	for in, want := range cases {
		if got := sanitizeName(in); got != want {
			t.Errorf("sanitizeName(%q) = %q, want %q", in, got, want)
		}
	}
}
