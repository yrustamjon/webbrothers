package traffic

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

// EventPage never contains request headers, bodies, cookies or full URLs.
type EventPage struct {
	Items        []HTTPEvent `json:"items"`
	PageSize     int         `json:"page_size"`
	NextCursor   *string     `json:"next_cursor"`
	HasMore      bool        `json:"has_more"`
	Availability string      `json:"availability"`
	Reason       string      `json:"reason,omitempty"`
}
type EventQuery struct {
	BrowserID string `json:"browser_id,omitempty"`
	ProfileID string `json:"profile_id,omitempty"`
	Cursor    string `json:"cursor,omitempty"`
	PageSize  int    `json:"page_size,omitempty"`
	Stream    bool   `json:"stream,omitempty"`
}
type HTTPEvent struct {
	ID            string   `json:"id"`
	Method        string   `json:"method"`
	SafeURL       string   `json:"safe_url"`
	Status        int      `json:"status"`
	DurationMS    *float64 `json:"duration_ms"`
	TransferBytes *uint64  `json:"transfer_bytes"`
	ObservedAt    string   `json:"observed_at"`
	Browser       *string  `json:"browser"`
	ProfileID     *string  `json:"profile_id"`
	Attribution   string   `json:"attribution"`
}
type eventEntry struct {
	seq   uint64
	at    time.Time
	value HTTPEvent
	bytes int
}

// EventRing is process-local and expires entries after one minute. Eviction overwrites references.
type EventRing struct {
	mu        sync.Mutex
	entries   []eventEntry
	used      int
	seq       uint64
	key       [32]byte
	now       func() time.Time
	connected bool
}

func NewEventRing() *EventRing { r := &EventRing{now: time.Now}; _, _ = rand.Read(r.key[:]); return r }
func (r *EventRing) Clear() {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.entries {
		r.entries[i] = eventEntry{}
	}
	r.entries = nil
	r.used = 0
	r.connected = false
}
func (r *EventRing) trim(now time.Time) {
	for len(r.entries) > 0 && (now.Sub(r.entries[0].at) > time.Minute || len(r.entries) > 512 || r.used > 256<<10) {
		r.used -= r.entries[0].bytes
		r.entries[0] = eventEntry{}
		r.entries = r.entries[1:]
	}
}
func safeOrigin(raw string) (string, error) {
	u, e := url.Parse(raw)
	if e != nil || u.User != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return "", errors.New("HTTP origin notoʻgʻri")
	}
	origin := u.Scheme + "://" + u.Host
	if len(origin) > 512 {
		return "", errors.New("Origin juda uzun")
	}
	if port := u.Port(); port != "" {
		n, e := strconv.Atoi(port)
		if e != nil || n < 1 || n > 65535 {
			return "", errors.New("Port notoʻgʻri")
		}
	}
	return origin, nil
}
func (r *EventRing) Add(v HTTPEvent) error {
	origin, e := safeOrigin(v.SafeURL)
	if e != nil {
		return e
	}
	v.SafeURL = origin
	switch v.Method {
	case "GET", "HEAD", "POST", "PUT", "DELETE", "OPTIONS", "PATCH", "CONNECT", "TRACE":
	default:
		return errors.New("HTTP metod notoʻgʻri")
	}
	if v.Status < 100 || v.Status > 599 {
		return errors.New("HTTP status notoʻgʻri")
	}
	if v.DurationMS != nil && (math.IsNaN(*v.DurationMS) || math.IsInf(*v.DurationMS, 0) || *v.DurationMS < 0 || *v.DurationMS > 600000) {
		return errors.New("Davomiylik notoʻgʻri")
	}
	if v.Browser == nil || (*v.Browser != "chrome" && *v.Browser != "edge" && *v.Browser != "brave" && *v.Browser != "firefox") {
		return errors.New("Brauzer notoʻgʻri")
	}
	// Extension instance does not prove an OS profile identity.
	v.ProfileID = nil
	v.Attribution = "browser"
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.now()
	r.seq++
	v.ID = fmt.Sprintf("%d", r.seq)
	v.ObservedAt = now.UTC().Format(time.RFC3339)
	b, _ := json.Marshal(v)
	r.entries = append(r.entries, eventEntry{seq: r.seq, at: now, value: v, bytes: len(b)})
	r.used += len(b)
	r.connected = true
	r.trim(now)
	return nil
}
func (r *EventRing) cursor(seq uint64, q EventQuery) string {
	raw := fmt.Sprintf("%d|%s|%s|%d", seq, q.BrowserID, q.ProfileID, r.now().Add(time.Minute).Unix())
	h := hmac.New(sha256.New, r.key[:])
	h.Write([]byte(raw))
	return base64.RawURLEncoding.EncodeToString([]byte(raw)) + "." + base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}
func (r *EventRing) Page(q EventQuery) (EventPage, error) {
	if q.PageSize == 0 {
		q.PageSize = 50
	}
	if q.PageSize != 20 && q.PageSize != 50 && q.PageSize != 100 {
		return EventPage{}, errors.New("Sahifa hajmi 20, 50 yoki 100 boʻlsin")
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.trim(r.now())
	var after uint64
	if q.Cursor != "" {
		parts := strings.Split(q.Cursor, ".")
		if len(parts) != 2 {
			return EventPage{}, errors.New("Cursor notoʻgʻri")
		}
		raw, e := base64.RawURLEncoding.DecodeString(parts[0])
		mac, e2 := base64.RawURLEncoding.DecodeString(parts[1])
		h := hmac.New(sha256.New, r.key[:])
		h.Write(raw)
		if e != nil || e2 != nil || !hmac.Equal(mac, h.Sum(nil)) {
			return EventPage{}, errors.New("Cursor notoʻgʻri")
		}
		var browser, profile string
		var expiry int64
		fields := strings.Split(string(raw), "|")
		if len(fields) != 4 {
			return EventPage{}, errors.New("Cursor notoʻgʻri")
		}
		browser = fields[1]
		profile = fields[2]
		if _, e = fmt.Sscanf(fields[0], "%d", &after); e != nil {
			return EventPage{}, e
		}
		if _, e = fmt.Sscanf(fields[3], "%d", &expiry); e != nil || expiry < r.now().Unix() || browser != q.BrowserID || profile != q.ProfileID {
			return EventPage{}, errors.New("Cursor muddati yoki filtri notoʻgʻri")
		}
	}
	out := EventPage{Items: []HTTPEvent{}, PageSize: q.PageSize, Availability: "available"}
	if !r.connected {
		out.Availability = "permission_required"
		out.Reason = "Qurilmada ixtiyoriy WebBrothers HTTP kengaytmasini ulang va sayt ruxsatlarini bering"
	}
	if q.ProfileID != "" {
		out.Availability = "unsupported"
		out.Reason = "Aniq profilga bogʻlash mavjud emas; brauzer darajasidagi soʻrovni tanlang"
		return out, nil
	}
	for _, e := range r.entries {
		if e.seq <= after || (q.BrowserID != "" && *e.value.Browser != q.BrowserID) {
			continue
		}
		if len(out.Items) == q.PageSize {
			out.HasMore = true
			cursor := r.cursor(after, q)
			out.NextCursor = &cursor
			break
		}
		out.Items = append(out.Items, e.value)
		after = e.seq
	}
	return out, nil
}

func (r *EventRing) Purge() { r.mu.Lock(); defer r.mu.Unlock(); r.trim(r.now()) }
