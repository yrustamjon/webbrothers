package traffic

import (
	"context"
	"testing"
	"time"
)

func TestSamplerReportsObservedIntervalsAndResets(t *testing.T) {
	s := NewSampler()
	at := time.Date(2026, 11, 5, 10, 0, 0, 0, time.UTC)
	first, err := s.observe(Stats{Received: 100, Sent: 50, Attribution: "device"}, at)
	if err != nil || first.DownloadBPS != nil || first.DailyReceived != 0 || first.State != "warming_up" {
		t.Fatal(first, err)
	}
	second, err := s.observe(Stats{Received: 300, Sent: 150, Attribution: "device"}, at.Add(2*time.Second))
	if err != nil || *second.DownloadBPS != 100 || *second.UploadBPS != 50 || second.DailyReceived != 200 || second.TotalBytes != 450 {
		t.Fatal(second, err)
	}
	reset, err := s.observe(Stats{Received: 10, Sent: 5, Attribution: "device"}, at.Add(3*time.Second))
	if err != nil || reset.State != "counter_reset" || reset.DownloadBPS != nil || reset.DailyReceived != 200 {
		t.Fatal(reset, err)
	}
	next, err := s.observe(Stats{Received: 20, Sent: 10, Attribution: "device"}, at.Add(24*time.Hour))
	if err != nil || next.DailyReceived != 0 || next.DailyObservedSince == first.DailyObservedSince {
		t.Fatal(next, err)
	}
}

func TestSamplerBoundsCollectionAndHonorsCancellation(t *testing.T) {
	s := NewSampler()
	now := time.Now()
	calls := 0
	s.now = func() time.Time { return now }
	s.collect = func() (Stats, error) { calls++; return Stats{Received: 1, Attribution: "device"}, nil }
	for range 10 {
		if _, err := s.Sample(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if calls != 1 {
		t.Fatal("collector was not throttled", calls)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := s.Sample(ctx); err == nil {
		t.Fatal("cancelled collection proceeded")
	}
	s.Clear()
	if s.cached.TotalBytes != 0 || !s.lastAt.IsZero() {
		t.Fatal("sampler state retained")
	}
}
