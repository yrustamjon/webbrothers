package main

import (
	"context"
	"encoding/json"
	"errors"
	"runtime"
	"sync"
	"time"
	"webbrothers/agent/internal/browser"
	"webbrothers/agent/internal/cache"
	"webbrothers/agent/internal/protocol"
	"webbrothers/agent/internal/traffic"
)

type discoveryEntry struct {
	items   []browser.Browser
	expires time.Time
}
type queryEngine struct {
	cache     *cache.Cache
	sampler   *traffic.Sampler
	events    *traffic.EventRing
	mu        sync.Mutex
	discovery [2]discoveryEntry
}

func newQueryEngine(c *cache.Cache) *queryEngine {
	return &queryEngine{cache: c, sampler: traffic.NewSampler(), events: traffic.NewEventRing()}
}
func (e *queryEngine) browsers(ctx context.Context, profiles, refresh bool) ([]browser.Browser, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	key := 0
	if profiles {
		key = 1
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	entry := e.discovery[key]
	if !refresh && time.Now().Before(entry.expires) {
		return entry.items, nil
	}
	items, err := browser.Current(profiles)
	if err != nil {
		return nil, err
	}
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	e.discovery[key] = discoveryEntry{items: items, expires: time.Now().Add(2 * time.Second)}
	return items, nil
}
func (e *queryEngine) clear() {
	e.cache.Clear()
	e.sampler.Clear()
	e.events.Clear()
	traffic.ClearConnections()
	e.mu.Lock()
	e.discovery = [2]discoveryEntry{}
	e.mu.Unlock()
}
func handle(m protocol.Message, c *cache.Cache, includeProfiles ...bool) (any, error) {
	return newQueryEngine(c).handle(context.Background(), m, includeProfiles...)
}
func (e *queryEngine) handle(ctx context.Context, m protocol.Message, includeProfiles ...bool) (any, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}
	if m.Type == "TRAFFIC_STATS_REQUEST" {
		var p trafficParams
		if err := decode(m.Params, &p); err != nil {
			return nil, errors.New("Parametrlar notoʻgʻri")
		}
		return e.sampler.Sample(ctx)
	}
	if m.Type == "CONNECTIONS_QUERY" {
		var q traffic.EventQuery
		if decode(m.Params, &q) != nil {
			return nil, errors.New("Ulanish parametrlari notoʻgʻri")
		}
		return traffic.ConnectionsContext(ctx, q)
	}
	if m.Type == "HTTP_EVENTS_QUERY" {
		var q traffic.EventQuery
		if decode(m.Params, &q) != nil {
			return nil, errors.New("HTTP metadata parametrlari notoʻgʻri")
		}
		return e.events.Page(q)
	}
	profiles := true
	if len(includeProfiles) > 0 {
		profiles = includeProfiles[0]
	}
	b, err := e.browsers(ctx, profiles, m.Type == "BROWSER_LIST_REQUEST")
	if err != nil {
		return nil, err
	}
	switch m.Type {
	case "BROWSER_LIST_REQUEST":
		if err := decode(m.Params, &struct{}{}); err != nil {
			return nil, errors.New("Parametrlar notoʻgʻri")
		}
		items := make([]map[string]any, 0, len(b))
		for _, br := range b {
			caps := []string{"history.read", "query.cursor", "query.streaming"}
			if br.ID == "chrome" || br.ID == "edge" || br.ID == "brave" {
				caps = append(caps, "login.inventory", "login.manage", "traffic.http")
			}
			if br.ID == "firefox" {
				caps = append(caps, "traffic.http")
			}
			if runtime.GOOS == "linux" || runtime.GOOS == "darwin" || runtime.GOOS == "windows" {
				caps = append(caps, "traffic.aggregate", "traffic.connections")
			}
			items = append(items, map[string]any{"id": br.ID, "name": br.Name, "profiles": br.Profiles, "capabilities": caps})
		}
		return map[string]any{"items": items}, nil
	case "PROFILE_LIST_REQUEST":
		var p struct {
			BrowserID string `json:"browser_id"`
		}
		if decode(m.Params, &p) != nil {
			return nil, errors.New("Parametrlar notoʻgʻri")
		}
		for _, br := range b {
			if br.ID == p.BrowserID {
				return map[string]any{"items": br.Profiles}, nil
			}
		}
		return nil, errors.New("Brauzer topilmadi")
	case "HISTORY_QUERY", "LOGIN_INVENTORY_QUERY":
		var q browser.Query
		if decode(m.Params, &q) != nil {
			return nil, errors.New("Maʼlumot parametrlari notoʻgʻri")
		}
		if q.Page == 0 {
			q.Page = 1
		}
		if q.PageSize == 0 {
			q.PageSize = 50
		}
		category := "history"
		if m.Type == "LOGIN_INVENTORY_QUERY" {
			category = "inventory"
		}
		key := browser.QueryFingerprint(b, q, category)
		if key == "" {
			return nil, errors.New("Profil yoki manba topilmadi; ruxsatlarni tekshiring")
		}
		if data, ok := e.cache.Get(key); ok {
			return json.RawMessage(data), nil
		}
		var result any
		if category == "history" {
			result, err = browser.HistoryContext(ctx, b, q)
		} else {
			result, err = browser.InventoryQueryContext(ctx, b, q)
		}
		if err != nil {
			return nil, err
		}
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		data, err := json.Marshal(result)
		if err != nil {
			return nil, err
		}
		e.cache.Set(key, data)
		return result, nil
	case "PASSWORD_REVEAL_QUERY":
		var p struct {
			BrowserID string `json:"browser_id"`
			ProfileID string `json:"profile_id"`
			Domain    string `json:"domain"`
			Username  string `json:"username"`
		}
		if decode(m.Params, &p) != nil {
			return nil, errors.New("Parametrlar notoʻgʻri")
		}
		pw, err := browser.RevealPassword(b, p.BrowserID, p.ProfileID, p.Domain, p.Username)
		if err != nil {
			return nil, err
		}
		return map[string]any{"password": pw, "domain": p.Domain, "username": p.Username}, nil
	case "LOGIN_CREATE_COMMAND":
		var p struct {
			BrowserID string `json:"browser_id"`
			ProfileID string `json:"profile_id"`
			Domain    string `json:"domain"`
			Username  string `json:"username"`
			Password  string `json:"password"`
		}
		if decode(m.Params, &p) != nil {
			return nil, errors.New("Parametrlar notoʻgʻri")
		}
		err := browser.SavePassword(b, p.BrowserID, p.ProfileID, p.Domain, p.Username, p.Password)
		if err != nil {
			return nil, err
		}
		e.cache.Clear()
		return map[string]any{"success": true, "domain": p.Domain, "username": p.Username}, nil
	case "LOGIN_DELETE_COMMAND":
		var p struct {
			BrowserID string `json:"browser_id"`
			ProfileID string `json:"profile_id"`
			Domain    string `json:"domain"`
			Username  string `json:"username"`
		}
		if decode(m.Params, &p) != nil {
			return nil, errors.New("Parametrlar notoʻgʻri")
		}
		err := browser.DeletePassword(b, p.BrowserID, p.ProfileID, p.Domain, p.Username)
		if err != nil {
			return nil, err
		}
		e.cache.Clear()
		return map[string]any{"success": true, "domain": p.Domain, "username": p.Username}, nil
	}
	return nil, errors.New("Soʻrov turi qoʻllanmaydi")
}

type trafficParams struct {
	BrowserID   string `json:"browser_id,omitempty"`
	ProfileID   string `json:"profile_id,omitempty"`
	Stream      bool   `json:"stream"`
	SampleCount int    `json:"sample_count"`
	IntervalMS  int    `json:"interval_ms"`
}

func wantsStream(m protocol.Message) bool {
	var p struct {
		Stream bool `json:"stream"`
	}
	if json.Unmarshal(m.Params, &p) != nil {
		return false
	}
	return p.Stream
}
func (e *queryEngine) stream(t *streamTask, m protocol.Message, includeProfiles bool, send func(any) error) error {
	if m.Type == "TRAFFIC_STATS_REQUEST" {
		var p trafficParams
		if decode(m.Params, &p) != nil {
			return errors.New("Trafik parametrlari notoʻgʻri")
		}
		if p.SampleCount == 0 {
			p.SampleCount = 20
		}
		if p.IntervalMS == 0 {
			p.IntervalMS = 1000
		}
		if p.SampleCount < 1 || p.SampleCount > 20 || p.IntervalMS < 1000 || p.IntervalMS > 5000 {
			return errors.New("Trafik stream chegarasi notoʻgʻri")
		}
		response := m
		response.Type = protocol.Responses[m.Type]
		for seq := 0; seq < p.SampleCount; seq++ {
			stats, err := e.sampler.Sample(t.ctx)
			if err != nil {
				return err
			}
			if err := t.send(response, seq, seq == p.SampleCount-1, stats, send); err != nil {
				return err
			}
			if seq+1 < p.SampleCount {
				timer := time.NewTimer(time.Duration(p.IntervalMS) * time.Millisecond)
				select {
				case <-timer.C:
				case <-t.ctx.Done():
					timer.Stop()
					return t.ctx.Err()
				}
			}
		}
		return nil
	}
	payload, err := e.handle(t.ctx, m, includeProfiles)
	if err != nil {
		return err
	}
	return streamPages(t, m, payload, send)
}
