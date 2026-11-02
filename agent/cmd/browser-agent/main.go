package main

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"syscall"
	"time"
	"webbrothers/agent/internal/browser"
	"webbrothers/agent/internal/cache"
	"webbrothers/agent/internal/identity"
	"webbrothers/agent/internal/protocol"
	"webbrothers/agent/internal/traffic"
	"webbrothers/agent/internal/transport"
)

func main() {
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, "Agent xatosi:", e)
		os.Exit(1)
	}
}
func run() error {
	server := flag.String("server", "", "HTTPS server manzili")
	action := flag.String("action", "run", "pair, run, discover yoki clear-cache")
	scopes := flag.String("scopes", "", "Mahalliy rozilik: vergul bilan ajratilgan ruxsatlar")
	state := flag.String("state", "", "Shifrlangan identifikator fayli")
	flag.Parse()
	if *action == "discover" {
		b, e := browser.Current()
		if e != nil {
			return e
		}
		return json.NewEncoder(os.Stdout).Encode(b)
	}
	if *action == "clear-cache" {
		fmt.Println("Kesh faqat tezkor xotirada; agentni qayta ishga tushirish uni tozalaydi.")
		return nil
	}
	if *state == "" {
		d, e := os.UserConfigDir()
		if e != nil {
			return e
		}
		*state = filepath.Join(d, "browser-monitoring", "identity.enc")
	}
	pass := os.Getenv("BROWSER_AGENT_KEY_PASSPHRASE")
	if len(pass) < 16 {
		return errors.New("BROWSER_AGENT_KEY_PASSPHRASE mahalliy sirini (kamida 16 belgi) xavfsiz xizmat muhiti orqali belgilang")
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if *action == "pair" {
		return pair(ctx, *server, *state, pass, *scopes)
	}
	if *action != "run" {
		return errors.New("Amal qoʻllanmaydi")
	}
	i, e := identity.Load(*state, pass)
	if e != nil {
		return e
	}
	if i.Token == "" || i.DeviceID == "" {
		return errors.New("Qurilmani avval pair amali bilan ulang")
	}
	for attempt := 0; ctx.Err() == nil; attempt++ {
		if e = serve(ctx, *server, i); e == nil {
			return nil
		}
		fmt.Fprintln(os.Stderr, "Server bilan ulanish uzildi; qayta ulanmoqda.")
		timer := time.NewTimer(transport.Backoff(attempt))
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
		}
	}
	return nil
}
func post(ctx context.Context, server, path string, in, out any) error {
	endpoint, e := transport.Endpoint(server, path)
	if e != nil {
		return e
	}
	data, e := json.Marshal(in)
	if e != nil {
		return e
	}
	req, e := http.NewRequestWithContext(ctx, "POST", endpoint, bytes.NewReader(data))
	if e != nil {
		return e
	}
	req.Header.Set("Content-Type", "application/json")
	r, e := transport.Client().Do(req)
	if e != nil {
		return errors.New("HTTPS serveriga ulanib boʻlmadi")
	}
	defer r.Body.Close()
	if r.StatusCode < 200 || r.StatusCode >= 300 {
		return fmt.Errorf("Server soʻrovni rad etdi (%d)", r.StatusCode)
	}
	d := json.NewDecoder(io.LimitReader(r.Body, protocol.MaxPayload))
	return d.Decode(out)
}
func pair(ctx context.Context, server, path, pass, scopes string) error {
	if _, e := os.Stat(path); e == nil {
		return errors.New("Mavjud identifikator ustiga yozilmaydi; avval qurilmani bekor qiling va faylni mahalliy oʻchiring")
	} else if !os.IsNotExist(e) {
		return e
	}
	allowed := []string{}
	known := map[string]bool{}
	for _, s := range protocol.Scopes {
		known[s] = true
	}
	for _, s := range strings.Split(scopes, ",") {
		s = strings.TrimSpace(s)
		if !known[s] {
			return errors.New("Aniq --scopes roziligi talab qilinadi; nomaʼlum ruxsat rad etildi")
		}
		allowed = append(allowed, s)
	}
	fmt.Println("Faqat sizga tegishli joriy OS hisobidagi maʼlumotlar yigʻiladi. Rozilik:", strings.Join(allowed, ", "))
	i, e := identity.New()
	if e != nil {
		return e
	}
	name, _ := os.Hostname()
	var start struct {
		PairingID string    `json:"pairing_id"`
		Code      string    `json:"code"`
		PollToken string    `json:"poll_token"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	if e = post(ctx, server, "/api/v1/pairing/start", map[string]string{"display_name": name, "operating_system": runtime.GOOS, "architecture": runtime.GOARCH, "public_key": i.PublicKey()}, &start); e != nil {
		return e
	}
	fmt.Println("Boshqaruv panelida ulash kodi:", start.Code)
	if start.ExpiresAt.IsZero() || start.ExpiresAt.After(time.Now().Add(15*time.Minute)) {
		return errors.New("Ulash muddati notoʻgʻri")
	}
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()
	for time.Now().Before(start.ExpiresAt) {
		select {
		case <-ctx.Done():
			return nil
		case <-ticker.C:
		}
		var poll struct {
			Status   string   `json:"status"`
			DeviceID string   `json:"device_id"`
			Token    string   `json:"device_token"`
			Scopes   []string `json:"scopes"`
		}
		if e = post(ctx, server, "/api/v1/pairing/poll", map[string]string{"pairing_id": start.PairingID, "poll_token": start.PollToken}, &poll); e != nil {
			return e
		}
		if poll.Token != "" && poll.DeviceID != "" {
			i.DeviceID = poll.DeviceID
			i.Token = poll.Token
			i.Scopes = []string{}
			for _, local := range allowed {
				for _, granted := range poll.Scopes {
					if local == granted {
						i.Scopes = append(i.Scopes, local)
						break
					}
				}
			}
			if len(i.Scopes) == 0 {
				return errors.New("Server mahalliy rozilikka mos ruxsat bermadi")
			}
			if e = identity.Save(path, pass, i); e != nil {
				return e
			}
			fmt.Println("Qurilma ulandi. Agentni run amali bilan ishga tushiring.")
			return nil
		}
	}
	return errors.New("Ulash kodi muddati tugadi")
}
func decode(raw json.RawMessage, out any) error { return protocol.Decode(raw, out) }

func handle(m protocol.Message, c *cache.Cache) (any, error) {
	b, e := browser.Current()
	if e != nil {
		return nil, e
	}
	switch m.Type {
	case "BROWSER_LIST_REQUEST":
		return map[string]any{"items": b}, nil
	case "PROFILE_LIST_REQUEST":
		var p struct {
			BrowserID string `json:"browser_id"`
		}
		if e = decode(m.Params, &p); e != nil {
			return nil, errors.New("Parametrlar notoʻgʻri")
		}
		for _, v := range b {
			if v.ID == p.BrowserID {
				return map[string]any{"items": v.Profiles}, nil
			}
		}
		return nil, errors.New("Brauzer topilmadi")
	case "HISTORY_QUERY":
		var q browser.Query
		if e = decode(m.Params, &q); e != nil {
			return nil, errors.New("Tarix parametrlari notoʻgʻri")
		}
		if q.Page == 0 {
			q.Page = 1
		}
		if q.PageSize == 0 {
			q.PageSize = 50
		}
		found := false
		for _, br := range b {
			if br.ID == q.BrowserID {
				for _, p := range br.Profiles {
					if p.ID == q.ProfileID {
						found = true
					}
				}
			}
		}
		if !found {
			return nil, errors.New("Profil topilmadi yoki ruxsat yoʻq")
		}
		key := string(m.Params)
		if data, ok := c.Get(key); ok {
			return json.RawMessage(data), nil
		}
		p, e := browser.History(b, q)
		if e != nil {
			return nil, e
		}
		data, e := json.Marshal(p)
		if e != nil {
			return nil, e
		}
		c.Set(key, data)
		return p, nil
	case "LOGIN_INVENTORY_QUERY":
		return nil, errors.New("Login inventari uchun ruxsatli brauzer kengaytmasi zarur; parollar oʻqilmaydi")
	case "TRAFFIC_STATS_REQUEST":
		return traffic.Collect()
	}
	return nil, errors.New("Soʻrov turi qoʻllanmaydi")
}
func serve(ctx context.Context, server string, i identity.Identity) error {
	conn, e := transport.Dial(ctx, server, i.Token)
	if e != nil {
		return e
	}
	defer conn.Close()
	conn.SetReadDeadline(time.Now().Add(15 * time.Second))
	var challenge struct {
		Version   int       `json:"version"`
		Type      string    `json:"type"`
		DeviceID  string    `json:"device_id"`
		Nonce     string    `json:"nonce"`
		ExpiresAt time.Time `json:"expires_at"`
	}
	_, challengeRaw, challengeErr := conn.ReadMessage()
	if challengeErr != nil {
		return challengeErr
	}
	if e = protocol.Decode(challengeRaw, &challenge); e != nil {
		return e
	}
	nonce, e := base64.RawURLEncoding.DecodeString(challenge.Nonce)
	if e != nil || len(nonce) != 32 || challenge.Version != 1 || challenge.Type != "AUTH_CHALLENGE" || challenge.DeviceID != i.DeviceID || !challenge.ExpiresAt.After(time.Now()) || challenge.ExpiresAt.After(time.Now().Add(20*time.Second)) {
		return errors.New("Server autentifikatsiya soʻrovi notoʻgʻri")
	}
	signed := ed25519.Sign(ed25519.PrivateKey(i.PrivateKey), []byte("BMP-AGENT-AUTH-V1\n"+i.DeviceID+"\n"+challenge.Nonce))
	conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
	if e = conn.WriteJSON(map[string]any{"version": 1, "type": "AUTH_PROOF", "device_id": i.DeviceID, "nonce": challenge.Nonce, "signature": base64.StdEncoding.EncodeToString(signed)}); e != nil {
		return e
	}
	v := protocol.New(i.DeviceID, i.Scopes)
	c := cache.New(4<<20, 15*time.Second)
	defer c.Clear()
	var write sync.Mutex
	send := func(m any) error {
		write.Lock()
		defer write.Unlock()
		conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return conn.WriteJSON(m)
	}
	done := make(chan struct{})
	defer close(done)
	go func() {
		t := time.NewTicker(20 * time.Second)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				conn.Close()
				return
			case <-done:
				return
			case <-t.C:
				if send(map[string]any{"version": 1, "device_id": i.DeviceID, "type": "HEARTBEAT", "timestamp": time.Now().UTC()}) != nil {
					conn.Close()
					return
				}
			}
		}
	}()
	for {
		conn.SetReadDeadline(time.Now().Add(65 * time.Second))
		var m protocol.Message
		_, raw, readErr := conn.ReadMessage()
		if readErr != nil {
			return readErr
		}
		if e = protocol.ValidateIncoming(raw, &m, i.DeviceID); e != nil {
			return e
		}
		if m.Type == "HEARTBEAT" {
			continue
		}
		if e = v.Validate(m, time.Now()); e != nil {
			r := m
			r.Params = nil
			r.Type = "AGENT_ERROR"
			r.Error = &protocol.Error{Code: "DENIED", Message: e.Error()}
			if e = send(r); e != nil {
				return e
			}
			continue
		}
		payload, err := handle(m, c)
		r := m
		r.Params = nil
		r.Type = protocol.Responses[m.Type]
		r.Payload = payload
		if err != nil {
			r.Type = "AGENT_ERROR"
			r.Payload = nil
			r.Error = &protocol.Error{Code: "UNAVAILABLE", Message: err.Error()}
		}
		encoded, err := json.Marshal(r)
		if err != nil || len(encoded) > protocol.MaxPayload {
			r.Payload = nil
			r.Type = "AGENT_ERROR"
			r.Error = &protocol.Error{Code: "TOO_LARGE", Message: "Javob juda katta; sahifa hajmini kamaytiring"}
		}
		if e = send(r); e != nil {
			return e
		}
	}
}
