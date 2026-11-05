package traffic

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"
)

func seedConnections(t *testing.T, q EventQuery, count int) string {
	t.Helper()
	ClearConnections()
	connectionState.Lock()
	defer connectionState.Unlock()
	connectionState.ready = true
	now := time.Now()
	items := make([]Connection, count)
	for i := range items {
		items[i] = Connection{ID: fmt.Sprint(i), DestinationIP: "192.0.2.1", Port: 443, Protocol: "tcp", Attribution: "unknown"}
	}
	connectionState.snapshots = []connectionSnapshot{{id: "fixture", filter: connectionFilter(q), at: now, items: items}}
	return signConnectionCursor(connectionCursor{Snapshot: "fixture", Filter: connectionFilter(q), Offset: 0, Expires: now.Add(30 * time.Second).Unix()})
}
func TestConnectionSnapshotPaginationAndBinding(t *testing.T) {
	q := EventQuery{BrowserID: "chrome", PageSize: 20}
	q.Cursor = seedConnections(t, q, 55)
	seen := map[string]bool{}
	for {
		p, e := ConnectionsContext(context.Background(), q)
		if e != nil {
			t.Fatal(e)
		}
		for _, v := range p.Items {
			if seen[v.ID] {
				t.Fatal("duplicate")
			}
			seen[v.ID] = true
			if v.TransferBytes != nil {
				t.Fatal("invented bytes")
			}
		}
		if !p.HasMore {
			break
		}
		q.Cursor = *p.NextCursor
	}
	if len(seen) != 55 {
		t.Fatal(len(seen))
	}
	q.BrowserID = "firefox"
	if _, e := ConnectionsContext(context.Background(), q); e == nil {
		t.Fatal("cursor scope accepted")
	}
	q.BrowserID = "chrome"
	q.Cursor += "x"
	if _, e := ConnectionsContext(context.Background(), q); e == nil {
		t.Fatal("tamper accepted")
	}
	ClearConnections()
}
func TestConnectionPermissionAndCancellation(t *testing.T) {
	p, e := ConnectionsContext(context.Background(), EventQuery{ProfileID: "profile", PageSize: 50})
	if e != nil || p.Availability != "unsupported" || len(p.Items) != 0 {
		t.Fatal(p, e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := ConnectionsContext(ctx, EventQuery{}); e != context.Canceled {
		t.Fatal(e)
	}
	for _, n := range []int{1, 25, 200} {
		if _, e := ConnectionsContext(context.Background(), EventQuery{PageSize: n}); e == nil {
			t.Fatal(n)
		}
	}
}
func TestConnectionSnapshotConcurrentClear(t *testing.T) {
	q := EventQuery{PageSize: 20}
	q.Cursor = seedConnections(t, q, 100)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, _ = ConnectionsContext(context.Background(), q) }()
	}
	ClearConnections()
	wg.Wait()
}
func TestConnectionEndpointAndProcess(t *testing.T) {
	for _, raw := range []string{"example.com:443", "0.0.0.0:443", "192.0.2.1:0", "192.0.2.1:65536", "*:*", ""} {
		if _, _, ok := connectionEndpoint(raw); ok {
			t.Fatal(raw)
		}
	}
	for _, raw := range []string{"192.0.2.1:443", "[2001:db8::1]:53"} {
		if _, _, ok := connectionEndpoint(raw); !ok {
			t.Fatal(raw)
		}
	}
	if browserFromProcess("unrelated chrome payload") != nil {
		t.Fatal("loose match")
	}
	if b := browserFromProcess("Google Chrome"); b == nil || *b != "chrome" {
		t.Fatal(b)
	}
	if strings.Contains(connectionFilter(EventQuery{BrowserID: "chrome"}), "chrome") {
		t.Fatal("raw filter")
	}
}
