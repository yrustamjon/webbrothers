package traffic

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const BridgeAddress = "127.0.0.1:18444"

// BridgeKey is an application pairing key, never a browser credential.
func BridgeKey(privateKey []byte) string {
	h := hmac.New(sha256.New, privateKey)
	h.Write([]byte("webbrothers-local-http-metadata-v1"))
	return base64.RawURLEncoding.EncodeToString(h.Sum(nil))
}

type bridgeHandler struct {
	key    string
	ring   *EventRing
	mu     sync.Mutex
	window time.Time
	count  int
}

func (h *bridgeHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	origin := r.Header.Get("Origin")
	if !(strings.HasPrefix(origin, "chrome-extension://") || strings.HasPrefix(origin, "moz-extension://")) || strings.ContainsAny(origin, "\r\n") {
		http.Error(w, "Extension origin required", 403)
		return
	}
	if r.Host != BridgeAddress {
		http.Error(w, "Invalid host", 403)
		return
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Vary", "Origin")
	if r.Method == "OPTIONS" {
		w.Header().Set("Access-Control-Allow-Methods", "POST")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.WriteHeader(204)
		return
	}
	if r.Method != "POST" || r.URL.Path != "/v1/http-events" {
		http.NotFound(w, r)
		return
	}
	auth := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !hmac.Equal([]byte(auth), []byte(h.key)) {
		http.Error(w, "Unauthorized", 401)
		return
	}
	h.mu.Lock()
	now := time.Now()
	if now.Sub(h.window) >= time.Second {
		h.window = now
		h.count = 0
	}
	h.count++
	limited := h.count > 100
	h.mu.Unlock()
	if limited {
		http.Error(w, "Rate limit", 429)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	defer r.Body.Close()
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	var event HTTPEvent
	if d.Decode(&event) != nil || d.Decode(new(any)) != io.EOF {
		http.Error(w, "Invalid metadata", 400)
		return
	}
	if err := h.ring.Add(event); err != nil {
		http.Error(w, "Invalid metadata", 400)
		return
	}
	w.WriteHeader(204)
}
func ServeBridge(ctx context.Context, key string, ring *EventRing) error {
	if len(key) < 32 {
		return errors.New("Bridge kaliti notoʻgʻri")
	}
	listener, err := net.Listen("tcp4", BridgeAddress)
	if err != nil {
		return errors.New("Mahalliy HTTP metadata porti band")
	}
	server := &http.Server{Handler: &bridgeHandler{key: key, ring: ring}, ReadHeaderTimeout: 2 * time.Second, ReadTimeout: 3 * time.Second, WriteTimeout: 3 * time.Second, IdleTimeout: 5 * time.Second, MaxHeaderBytes: 4096}
	done := make(chan struct{})
	defer close(done)
	go func() {
		select {
		case <-ctx.Done():
			_ = server.Close()
		case <-done:
		}
	}()
	err = server.Serve(listener)
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
