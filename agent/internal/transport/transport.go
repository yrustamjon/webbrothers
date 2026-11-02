package transport

import (
	"context"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"encoding/binary"
	"errors"
	"github.com/gorilla/websocket"
	"net/http"
	"net/url"
	"os"
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
func tlsConfig() (*tls.Config, error) {
	config := &tls.Config{MinVersion: tls.VersionTLS13}
	if path := os.Getenv("SSL_CERT_FILE"); path != "" {
		pem, err := os.ReadFile(path)
		if err != nil {
			return nil, errors.New("Mahalliy CA faylini oʻqib boʻlmadi")
		}
		pool, err := x509.SystemCertPool()
		if err != nil {
			pool = x509.NewCertPool()
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, errors.New("Mahalliy CA sertifikati yaroqsiz")
		}
		config.RootCAs = pool
	}
	return config, nil
}
func Client() (*http.Client, error) {
	config, err := tlsConfig()
	if err != nil {
		return nil, err
	}
	return &http.Client{Timeout: 15 * time.Second, Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, TLSClientConfig: config}, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}, nil
}
func Dial(ctx context.Context, server, token string) (*websocket.Conn, error) {
	s, e := Endpoint(server, "/api/v1/ws/agent")
	if e != nil {
		return nil, e
	}
	u, _ := url.Parse(s)
	u.Scheme = "wss"
	config, e := tlsConfig()
	if e != nil {
		return nil, e
	}
	d := websocket.Dialer{Proxy: http.ProxyFromEnvironment, HandshakeTimeout: 15 * time.Second, TLSClientConfig: config}
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
