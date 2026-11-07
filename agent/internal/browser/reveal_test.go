package browser

import (
	"testing"
)

func TestUnpad(t *testing.T) {
	cases := []struct {
		in   []byte
		want string
	}{
		{[]byte("hello\x03\x03\x03"), "hello"},
		{[]byte("abc\x01"), "abc"},
		{[]byte(""), ""},
	}
	for _, c := range cases {
		if got := string(unpad(c.in)); got != c.want {
			t.Errorf("unpad(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestTrimPrefix(t *testing.T) {
	if got := string(trimPrefix([]byte("v10hello"))); got != "hello" {
		t.Errorf("v10 trim: %q", got)
	}
	if got := string(trimPrefix([]byte("v11world"))); got != "world" {
		t.Errorf("v11 trim: %q", got)
	}
	if got := string(trimPrefix([]byte("raw"))); got != "raw" {
		t.Errorf("no prefix: %q", got)
	}
}