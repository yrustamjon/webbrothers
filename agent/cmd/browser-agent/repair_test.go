package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestEnrollmentReplacementPreservesOldState(t *testing.T) {
	dir := t.TempDir()
	current, next, backup := filepath.Join(dir, "identity"), filepath.Join(dir, "next"), filepath.Join(dir, "backup")
	if err := os.WriteFile(current, []byte("old encrypted identity"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := replaceEnrollment(current, next, backup); err == nil {
		t.Fatal("missing new enrollment accepted")
	}
	old, err := os.ReadFile(current)
	if err != nil || string(old) != "old encrypted identity" {
		t.Fatal("failed enrollment damaged original")
	}
	if err := os.WriteFile(next, []byte("new encrypted identity"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := replaceEnrollment(current, next, backup); err != nil {
		t.Fatal(err)
	}
	old, _ = os.ReadFile(backup)
	newState, _ := os.ReadFile(current)
	if string(old) != "old encrypted identity" || string(newState) != "new encrypted identity" {
		t.Fatal("enrollment or backup lost")
	}
}
