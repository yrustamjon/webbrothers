package traffic

import (
	"context"
	"errors"
	"math"
	"sync"
	"time"
)

type LiveStats struct {
	Stats
	TotalBytes         uint64   `json:"total_bytes"`
	DownloadBPS        *float64 `json:"download_bps"`
	UploadBPS          *float64 `json:"upload_bps"`
	DailyReceived      uint64   `json:"daily_received_bytes"`
	DailySent          uint64   `json:"daily_sent_bytes"`
	DailyObservedSince string   `json:"daily_observed_since"`
	IntervalMS         int64    `json:"measurement_interval_ms"`
	State              string   `json:"sample_state"`
}

// Sampler retains only totals for the agent-observed part of the UTC day.
// It does not reconstruct traffic from periods when the agent was not running.
type Sampler struct {
	mu                       sync.Mutex
	now                      func() time.Time
	collect                  func() (Stats, error)
	last                     Stats
	lastAt                   time.Time
	day                      string
	since                    time.Time
	dailyReceived, dailySent uint64
	cached                   LiveStats
}

func NewSampler() *Sampler { return &Sampler{now: time.Now, collect: Collect} }

func (s *Sampler) Sample(ctx context.Context) (LiveStats, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if err := ctx.Err(); err != nil {
		return LiveStats{}, err
	}
	now := s.now()
	if !s.lastAt.IsZero() && now.Sub(s.lastAt) >= 0 && now.Sub(s.lastAt) < 500*time.Millisecond {
		return s.cached, nil
	}
	raw, err := s.collect()
	if err != nil {
		return LiveStats{}, err
	}
	if err := ctx.Err(); err != nil {
		return LiveStats{}, err
	}
	return s.observe(raw, now)
}

func (s *Sampler) observe(raw Stats, now time.Time) (LiveStats, error) {
	if raw.Sent > math.MaxUint64-raw.Received {
		return LiveStats{}, errors.New("Trafik yigʻindisi chegaradan oshdi")
	}
	day := now.UTC().Format("2006-01-02")
	newDay := s.day != day
	if newDay {
		s.day = day
		s.since = now
		s.dailyReceived = 0
		s.dailySent = 0
	}
	result := LiveStats{Stats: raw, TotalBytes: raw.Received + raw.Sent, State: "warming_up", DailyObservedSince: s.since.UTC().Format(time.RFC3339)}
	if !s.lastAt.IsZero() && now.After(s.lastAt) {
		result.IntervalMS = now.Sub(s.lastAt).Milliseconds()
		if raw.Received < s.last.Received || raw.Sent < s.last.Sent {
			result.State = "counter_reset"
		} else {
			received, sent := raw.Received-s.last.Received, raw.Sent-s.last.Sent
			download, upload := float64(received)/now.Sub(s.lastAt).Seconds(), float64(sent)/now.Sub(s.lastAt).Seconds()
			result.DownloadBPS = &download
			result.UploadBPS = &upload
			result.State = "measured"
			if !newDay {
				if received > math.MaxUint64-s.dailyReceived || sent > math.MaxUint64-s.dailySent {
					return LiveStats{}, errors.New("Kunlik trafik chegaradan oshdi")
				}
				s.dailyReceived += received
				s.dailySent += sent
			}
		}
	}
	result.DailyReceived = s.dailyReceived
	result.DailySent = s.dailySent
	s.last = raw
	s.lastAt = now
	s.cached = result
	return result, nil
}

func (s *Sampler) Clear() {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.last = Stats{}
	s.lastAt = time.Time{}
	s.cached = LiveStats{}
	s.day = ""
	s.since = time.Time{}
	s.dailyReceived = 0
	s.dailySent = 0
}
