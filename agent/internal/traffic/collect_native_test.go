//go:build darwin || windows

package traffic

import (
	"testing"
	"time"
)

// Reads aggregate OS byte counters only, never browser data or traffic contents.
// Run on native Windows/macOS CI runners to exercise the actual OS command API.
func TestNativeCollect(t *testing.T) {
	stats, err := Collect()
	if err != nil {
		t.Fatal(err)
	}
	if stats.Attribution != "device" {
		t.Fatal("non-device attribution")
	}
	if _, err := time.Parse(time.RFC3339, stats.CollectedAt); err != nil {
		t.Fatal(err)
	}
}
