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
	"runtime/debug"
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
	// Soft Go heap budget; SQLite/native allocations are measured separately.
	debug.SetMemoryLimit(64 << 20)
	if runtime.GOMAXPROCS(0) > 2 {
		runtime.GOMAXPROCS(2)
	}
	if e := run(); e != nil {
		fmt.Fprintln(os.Stderr, "Agent xatosi:", e)
		os.Exit(1)
	}
}
func run() error {
	server := flag.String("server", "", "HTTPS server manzili")
	action := flag.String("action", "run", "pair, re-pair, run, discover yoki clear-cache")
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
	if *action == "re-pair" {
		return rePair(ctx, *server, *state, pass, *scopes)
	}
	if *action == "bridge-info" {
		i, err := identity.Load(*state, pass)
		if err != nil {
			return err
		}
		for _, scope := range i.Scopes {
			if scope == "traffic.http" {
				return json.NewEncoder(os.Stdout).Encode(map[string]string{"url": "http://" + traffic.BridgeAddress, "key": traffic.BridgeKey(i.PrivateKey)})
			}
		}
		return errors.New("Avval traffic.http mahalliy roziligini bering")
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
	client, e := transport.Client()
	if e != nil {
		return e
	}
	r, e := client.Do(req)
	if e != nil {
		return transport.ConnectionError(e)
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

func serve(ctx context.Context, server string, i identity.Identity) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
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
	c := cache.New(4<<20, 5*time.Second)
	engine := newQueryEngine(c)
	defer engine.clear()
	var bridgeDone chan struct{}
	if v.Allowed["traffic.http"] {
		bridgeDone = make(chan struct{})
		go func() {
			defer close(bridgeDone)
			if err := traffic.ServeBridge(ctx, traffic.BridgeKey(i.PrivateKey), engine.events); err != nil {
				fmt.Fprintln(os.Stderr, "HTTP metadata kengaytmasi ulanmagan: mahalliy portni tekshiring.")
			}
		}()
		defer func() { cancel(); <-bridgeDone }()
	}
	group := newTaskGroup(ctx, 4)
	defer group.close()
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
		purge := time.NewTicker(time.Second)
		defer purge.Stop()
		for {
			select {
			case <-ctx.Done():
				conn.Close()
				return
			case <-done:
				return
			case <-purge.C:
				c.PurgeExpired()
				traffic.PurgeConnections()
				engine.events.Purge()
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
		if m.Type == "CANCEL_REQUEST" || m.Type == "STREAM_ACK" {
			if err := group.control(m); err != nil {
				return err
			}
			continue
		}
		if e = v.Validate(m, time.Now()); e != nil {
			r := m
			r.Params = nil
			r.Type = "AGENT_ERROR"
			r.Error = &protocol.Error{Code: "DENIED", Message: e.Error()}
			if wantsStream(m) {
				seq := 0
				final := true
				r.Sequence = &seq
				r.Final = &final
			}
			if e = send(r); e != nil {
				return e
			}
			continue
		}
		includeProfiles := m.Type != "BROWSER_LIST_REQUEST" || v.Allowed["profile.discovery"]
		request := m
		if err := group.start(request, func(task *streamTask) {
			var err error
			if wantsStream(request) {
				err = engine.stream(task, request, includeProfiles, send)
			} else {
				var payload any
				payload, err = engine.handle(task.ctx, request, includeProfiles)
				if err == nil && task.ctx.Err() == nil {
					response := request
					response.Params = nil
					response.Type = protocol.Responses[request.Type]
					response.Payload = payload
					encoded, encodeErr := json.Marshal(response)
					if encodeErr != nil || len(encoded) > protocol.MaxPayload {
						err = errors.New("Javob juda katta; sahifa hajmini kamaytiring")
					} else {
						err = send(response)
					}
				}
			}
			if err != nil && task.ctx.Err() == nil {
				response := request
				response.Params = nil
				response.Type = "AGENT_ERROR"
				response.Error = &protocol.Error{Code: "UNAVAILABLE", Message: err.Error()}
				if wantsStream(request) {
					seq := task.nextSequence()
					final := true
					response.Sequence = &seq
					response.Final = &final
				}
				_ = send(response)
			}
		}); err != nil {
			response := request
			response.Params = nil
			response.Type = "AGENT_ERROR"
			response.Error = &protocol.Error{Code: "BUSY", Message: err.Error()}
			if wantsStream(request) {
				seq := 0
				final := true
				response.Sequence = &seq
				response.Final = &final
			}
			if err := send(response); err != nil {
				return err
			}
		}
	}
}
