package browser

import (
	"bytes"
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

func TestPad(t *testing.T) {
	in := []byte("hello")
	padded := pad(in, 16)
	if len(padded) != 16 {
		t.Fatalf("expected length 16, got %d", len(padded))
	}
	unpadded := unpad(padded)
	if !bytes.Equal(unpadded, in) {
		t.Fatalf("unpad(pad(%q)) = %q", in, unpadded)
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

func TestDeletePassword(t *testing.T) {
	browsers, file := inventoryFixture(t)
	insertLogin(t, file, "https://example.com/login", "user1", 0)

	// Delete existing
	err := DeletePassword(browsers, "chrome", browsers[0].Profiles[0].ID, "example.com", "user1")
	if err != nil {
		t.Fatalf("DeletePassword failed: %v", err)
	}

	// Delete non-existent should fail
	err = DeletePassword(browsers, "chrome", browsers[0].Profiles[0].ID, "example.com", "user1")
	if err == nil {
		t.Fatal("expected error deleting non-existent login")
	}

	// Delete with invalid profile should fail
	err = DeletePassword(browsers, "chrome", "invalid_profile", "example.com", "user1")
	if err == nil {
		t.Fatal("expected error with invalid profile")
	}
}
