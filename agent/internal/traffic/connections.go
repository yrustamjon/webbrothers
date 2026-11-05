package traffic

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Connection describes an observed socket, never its payload or establishment time.
// OS socket tables do not expose exact browser-profile attribution or byte counters.
type Connection struct {
	ID            string  `json:"id"`
	DestinationIP string  `json:"destination_ip"`
	Port          int     `json:"port"`
	Protocol      string  `json:"protocol"`
	ObservedAt    string  `json:"observed_at"`
	TransferBytes *uint64 `json:"transfer_bytes"`
	Browser       *string `json:"browser"`
	Attribution   string  `json:"attribution"`
}
type ConnectionPage struct {
	Items        []Connection `json:"items"`
	PageSize     int          `json:"page_size"`
	NextCursor   *string      `json:"next_cursor"`
	HasMore      bool         `json:"has_more"`
	Availability string       `json:"availability"`
	Reason       string       `json:"reason,omitempty"`
}
type connectionSnapshot struct {
	id     string
	filter string
	at     time.Time
	items  []Connection
	reason string
}
type connectionCursor struct {
	Snapshot string `json:"s"`
	Filter   string `json:"f"`
	Offset   int    `json:"o"`
	Expires  int64  `json:"e"`
}

var connectionState = struct {
	sync.Mutex
	key       [32]byte
	ready     bool
	snapshots []connectionSnapshot
}{}

const maxConnections = 4096

func connectionFilter(q EventQuery) string {
	h := sha256.Sum256([]byte(q.BrowserID + "\x00" + q.ProfileID + "\x00" + strconv.Itoa(q.PageSize)))
	return hex.EncodeToString(h[:])
}
func browserFromProcess(name string) *string {
	var id string
	switch strings.ToLower(strings.TrimSpace(name)) {
	case "google chrome", "google chrome helper", "google chrome helper (renderer)", "chrome", "chrome.exe", "chromium":
		id = "chrome"
	case "firefox", "firefox.exe", "firefoxcp isolated web content":
		id = "firefox"
	case "microsoft edge", "microsoft edge helper", "msedge", "msedge.exe":
		id = "edge"
	case "brave browser", "brave browser helper", "brave", "brave.exe":
		id = "brave"
	case "safari":
		id = "safari"
	default:
		return nil
	}
	return &id
}
func connectionEndpoint(raw string) (string, int, bool) {
	host, port, e := net.SplitHostPort(raw)
	if e != nil {
		return "", 0, false
	}
	host = strings.Split(host, "%")[0]
	ip := net.ParseIP(host)
	n, e := strconv.Atoi(port)
	if ip == nil || e != nil || n < 1 || n > 65535 || ip.IsUnspecified() {
		return "", 0, false
	}
	return ip.String(), n, true
}
func signConnectionCursor(c connectionCursor) string {
	raw, _ := json.Marshal(c)
	h := hmac.New(sha256.New, connectionState.key[:])
	h.Write(raw)
	return base64.RawURLEncoding.EncodeToString(raw) + "." + base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}
func parseConnectionCursor(token, filter string, now time.Time) (connectionCursor, error) {
	var c connectionCursor
	if len(token) > 1024 {
		return c, errors.New("Cursor chegaradan katta")
	}
	p := strings.Split(token, ".")
	if len(p) != 2 {
		return c, errors.New("Cursor notoʻgʻri")
	}
	raw, e := base64.RawURLEncoding.DecodeString(p[0])
	sig, e2 := base64.RawURLEncoding.DecodeString(p[1])
	h := hmac.New(sha256.New, connectionState.key[:])
	h.Write(raw)
	if e != nil || e2 != nil || !hmac.Equal(sig, h.Sum(nil)) || json.Unmarshal(raw, &c) != nil || c.Filter != filter || c.Offset < 0 || c.Offset > maxConnections || c.Expires < now.Unix() || c.Expires > now.Add(35*time.Second).Unix() {
		return c, errors.New("Cursor muddati yoki filtri notoʻgʻri")
	}
	return c, nil
}
func pruneConnections(now time.Time) {
	kept := connectionState.snapshots[:0]
	for i := range connectionState.snapshots {
		s := connectionState.snapshots[i]
		if now.Sub(s.at) > 30*time.Second {
			clear(s.items)
			continue
		}
		kept = append(kept, s)
	}
	for i := len(kept); i < len(connectionState.snapshots); i++ {
		connectionState.snapshots[i] = connectionSnapshot{}
	}
	connectionState.snapshots = kept
}

// ClearConnections releases the bounded transient socket snapshots on revocation/shutdown.
func ClearConnections() {
	connectionState.Lock()
	defer connectionState.Unlock()
	for i := range connectionState.snapshots {
		clear(connectionState.snapshots[i].items)
		connectionState.snapshots[i] = connectionSnapshot{}
	}
	connectionState.snapshots = nil
}
func ConnectionsContext(ctx context.Context, q EventQuery) (ConnectionPage, error) {
	if q.PageSize == 0 {
		q.PageSize = 50
	}
	out := ConnectionPage{Items: []Connection{}, PageSize: q.PageSize, Availability: "available"}
	if q.PageSize != 20 && q.PageSize != 50 && q.PageSize != 100 {
		return out, errors.New("Sahifa hajmi 20, 50 yoki 100 boʻlsin")
	}
	if len(q.BrowserID) > 32 || len(q.ProfileID) > 256 {
		return out, errors.New("Trafik filtri chegaradan katta")
	}
	if err := ctx.Err(); err != nil {
		return out, err
	}
	if q.ProfileID != "" {
		out.Availability = "unsupported"
		out.Reason = "OS socket jadvalidan aniq brauzer profilini aniqlab boʻlmaydi"
		return out, nil
	}
	filter := connectionFilter(q)
	now := time.Now()
	connectionState.Lock()
	if !connectionState.ready {
		if _, e := rand.Read(connectionState.key[:]); e != nil {
			connectionState.Unlock()
			return out, errors.New("Xavfsiz cursor kaliti yaratilmagan")
		}
		connectionState.ready = true
	}
	pruneConnections(now)
	var snap connectionSnapshot
	offset := 0
	if q.Cursor != "" {
		c, e := parseConnectionCursor(q.Cursor, filter, now)
		if e != nil {
			connectionState.Unlock()
			return out, e
		}
		for _, s := range connectionState.snapshots {
			if s.id == c.Snapshot && s.filter == filter {
				snap = s
				snap.items = append([]Connection(nil), s.items...)
				offset = c.Offset
				break
			}
		}
		if snap.id == "" {
			connectionState.Unlock()
			return out, errors.New("Trafik snapshot muddati tugadi; yangilang")
		}
	}
	connectionState.Unlock()
	if snap.id == "" {
		collectCtx, cancel := context.WithTimeout(ctx, 2*time.Second)
		items, availability, reason, e := collectConnections(collectCtx)
		cancel()
		if e != nil {
			return out, e
		}
		out.Availability = availability
		out.Reason = reason
		if availability != "available" {
			return out, nil
		}
		filtered := make([]Connection, 0, len(items))
		for _, v := range items {
			if q.BrowserID != "" && (v.Browser == nil || *v.Browser != q.BrowserID) {
				continue
			}
			v.ObservedAt = now.UTC().Format(time.RFC3339Nano)
			h := sha256.Sum256([]byte(v.DestinationIP + ":" + strconv.Itoa(v.Port) + v.Protocol + v.ObservedAt + strconv.Itoa(len(filtered))))
			v.ID = hex.EncodeToString(h[:8])
			filtered = append(filtered, v)
			if len(filtered) >= maxConnections {
				reason = "Natija 4096 ta ulanish bilan cheklangan"
				break
			}
		}
		clear(items)
		sort.Slice(filtered, func(i, j int) bool {
			if filtered[i].DestinationIP != filtered[j].DestinationIP {
				return filtered[i].DestinationIP < filtered[j].DestinationIP
			}
			if filtered[i].Port != filtered[j].Port {
				return filtered[i].Port < filtered[j].Port
			}
			return filtered[i].ID < filtered[j].ID
		})
		var id [16]byte
		if _, e := rand.Read(id[:]); e != nil {
			return out, e
		}
		snap = connectionSnapshot{id: hex.EncodeToString(id[:]), filter: filter, at: now, items: filtered, reason: reason}
		connectionState.Lock()
		pruneConnections(now)
		if len(connectionState.snapshots) >= 8 {
			clear(connectionState.snapshots[0].items)
			copy(connectionState.snapshots, connectionState.snapshots[1:])
			connectionState.snapshots = connectionState.snapshots[:7]
		}
		connectionState.snapshots = append(connectionState.snapshots, snap)
		snap.items = append([]Connection(nil), snap.items...)
		connectionState.Unlock()
	}
	defer clear(snap.items)
	// The private copy cannot be zeroed by concurrent snapshot eviction.
	connectionState.Lock()
	defer connectionState.Unlock()
	if err := ctx.Err(); err != nil {
		return out, err
	}
	if offset > len(snap.items) {
		return out, errors.New("Cursor chegarasi notoʻgʻri")
	}
	end := offset + q.PageSize
	if end > len(snap.items) {
		end = len(snap.items)
	}
	out.Items = append(out.Items, snap.items[offset:end]...)
	out.Reason = snap.reason
	out.HasMore = end < len(snap.items)
	if out.HasMore {
		c := signConnectionCursor(connectionCursor{Snapshot: snap.id, Filter: filter, Offset: end, Expires: snap.at.Add(30 * time.Second).Unix()})
		out.NextCursor = &c
	}
	return out, nil
}

// PurgeConnections expires idle transient socket snapshots.
func PurgeConnections() {
	connectionState.Lock()
	defer connectionState.Unlock()
	pruneConnections(time.Now())
}
