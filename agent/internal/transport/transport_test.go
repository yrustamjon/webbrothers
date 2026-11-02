package transport

import (
	"context"
	"crypto/tls"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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
	client, err := Client()
	if err != nil {
		t.Fatal(err)
	}
	if _, e := client.Get(ts.URL); e == nil {
		t.Fatal("untrusted TLS accepted")
	}
	if _, e := Dial(context.Background(), ts.URL, "test-token"); e == nil {
		t.Fatal("WSS untrusted TLS accepted")
	}
}
func TestExplicitCA(t *testing.T) {
	ts := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	ts.TLS = &tls.Config{MinVersion: tls.VersionTLS13}
	ts.StartTLS()
	defer ts.Close()
	path := filepath.Join(t.TempDir(), "ca.pem")
	if err := os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: ts.Certificate().Raw}), 0600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("SSL_CERT_FILE", path)
	client, err := Client()
	if err != nil {
		t.Fatal(err)
	}
	response, err := client.Get(ts.URL)
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if err := os.WriteFile(path, []byte("invalid"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Client(); err == nil {
		t.Fatal("invalid CA accepted")
	}
	if _, err := Dial(context.Background(), ts.URL, "test-token"); err == nil {
		t.Fatal("invalid WSS CA accepted")
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
