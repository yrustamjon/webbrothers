package transport

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"encoding/binary"
	"errors"
	"github.com/gorilla/websocket"
	"net/http"
	"net/url"
	"strings"
	"time"
	"webbrothers/agent/internal/protocol"
)

func Endpoint(server, path string) (string, error) {
	u, e := url.Parse(server)
	if e != nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return "", errors.New("Server manzili tasdiqlangan HTTPS boʻlishi kerak")
	}
	u.Path = strings.TrimRight(u.Path, "/") + path
	return u.String(), nil
}
func Client() *http.Client {
	return &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS13}}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func Dial(ctx context.Context, server, token string) (*websocket.Conn, error) {
	s, e := Endpoint(server, "/api/v1/ws/agent")
	if e != nil {
		return nil, e
	}
	u, _ := url.Parse(s)
	u.Scheme = "wss"
	d := websocket.Dialer{Proxy: http.ProxyFromEnvironment, HandshakeTimeout: 15 * time.Second, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS13}}
	h := http.Header{}
	h.Set("Authorization", "Bearer "+token)
	c, _, e := d.DialContext(ctx, u.String(), h)
	if e == nil {
		c.SetReadLimit(protocol.MaxPayload)
	}
	return c, e
}
func Backoff(attempt int) time.Duration {
	if attempt > 6 {
		attempt = 6
	}
	if attempt < 0 {
		attempt = 0
	}
	var v [8]byte
	_, _ = rand.Read(v[:])
	base := time.Second * time.Duration(1<<attempt)
	return base + time.Duration(binary.LittleEndian.Uint64(v[:])%uint64(base/2+1))
}
