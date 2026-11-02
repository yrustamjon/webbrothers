package transport

import (
	"context"
	"crypto/tls"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRejectInsecureURLAndUntrustedTLS(t *testing.T) {
	for _, s := range []string{"http://localhost", "wss://localhost", "https://user:password@example.test", "https://example.test?token=bad"} {
		if _, e := Endpoint(s, "/api/v1"); e == nil {
			t.Fatalf("unsafe endpoint %s", s)
		}
	}
	ts := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	ts.TLS = &tls.Config{MinVersion: tls.VersionTLS13}
	ts.StartTLS()
	defer ts.Close()
	if _, e := Client().Get(ts.URL); e == nil {
		t.Fatal("untrusted TLS accepted")
	}
	if _, e := Dial(context.Background(), ts.URL, "test-token"); e == nil {
		t.Fatal("WSS untrusted TLS accepted")
	}
}
func TestBackoffBounded(t *testing.T) {
	for i := 0; i < 20; i++ {
		d := Backoff(i)
		if d < time.Second || d > 96*time.Second {
			t.Fatalf("unbounded %v", d)
		}
	}
}
