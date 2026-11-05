package traffic

import (
	"fmt"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestHTTPRingBoundedRedactedAndExpiry(t *testing.T) {
	r := NewEventRing()
	now := time.Now()
	r.now = func() time.Time { return now }
	browser := "chrome"
	for i := 0; i < 600; i++ {
		if err := r.Add(HTTPEvent{Method: "GET", SafeURL: fmt.Sprintf("https://example.test/private/%d?token=secret#secret", i), Status: 200, Browser: &browser}); err != nil {
			t.Fatal(err)
		}
	}
	if len(r.entries) > 512 || r.used > 256<<10 {
		t.Fatal("unbounded ring")
	}
	p, e := r.Page(EventQuery{PageSize: 20})
	if e != nil || len(p.Items) != 20 || !p.HasMore {
		t.Fatalf("page: %+v %v", p, e)
	}
	for _, v := range p.Items {
		if v.SafeURL != "https://example.test" || v.ProfileID != nil {
			t.Fatal("unsafe URL/profile")
		}
	}
	next, e := r.Page(EventQuery{PageSize: 20, Cursor: *p.NextCursor})
	if e != nil || next.Items[0].ID == p.Items[0].ID {
		t.Fatal("cursor")
	}
	if _, e = r.Page(EventQuery{BrowserID: "edge", Cursor: *p.NextCursor}); e == nil {
		t.Fatal("cursor filter binding")
	}
	now = now.Add(2 * time.Minute)
	p, e = r.Page(EventQuery{})
	if e != nil || len(p.Items) != 0 {
		t.Fatal("TTL")
	}
	r.Clear()
	if r.used != 0 || len(r.entries) != 0 {
		t.Fatal("clear")
	}
}
func TestBridgeRejectsUnknownSecretsAndUnauthorized(t *testing.T) {
	r := NewEventRing()
	h := &bridgeHandler{key: strings.Repeat("x", 43), ring: r}
	for _, tt := range []struct {
		origin, key, body string
		status            int
	}{{"https://evil.test", h.key, `{}`, 403}, {"chrome-extension://abc", "wrong", `{}`, 401}, {"chrome-extension://abc", h.key, `{"cookie":"secret"}`, 400}, {"chrome-extension://abc", h.key, `{"method":"GET","safe_url":"https://safe.test/path?token=secret","status":200,"browser":"chrome"}`, 204}} {
		req := httptest.NewRequest("POST", "http://"+BridgeAddress+"/v1/http-events", strings.NewReader(tt.body))
		req.Header.Set("Origin", tt.origin)
		req.Header.Set("Authorization", "Bearer "+tt.key)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, req)
		if w.Code != tt.status {
			t.Fatalf("got %d want %d", w.Code, tt.status)
		}
	}
	p, _ := r.Page(EventQuery{})
	if len(p.Items) != 1 || p.Items[0].SafeURL != "https://safe.test" {
		t.Fatal("unsafe event")
	}
}
