package protocol

import (
	"testing"
	"time"
)

func request() Message {
	now := time.Now().UTC()
	return Message{Version: 1, RequestID: "r1", DeviceID: "d1", Type: "HISTORY_QUERY", Timestamp: now, ExpiresAt: now.Add(20 * time.Second), Scope: "history.read"}
}
func TestPermissionExpiryReplay(t *testing.T) {
	v := New("d1", []string{"history.read"})
	m := request()
	if e := v.Validate(m, time.Now()); e != nil {
		t.Fatal(e)
	}
	if e := v.Validate(m, time.Now()); e == nil {
		t.Fatal("replay")
	}
	tests := []func(*Message){func(m *Message) { m.Type = "EXEC" }, func(m *Message) { m.DeviceID = "other" }, func(m *Message) { m.Scope = "browser.discovery" }, func(m *Message) { m.Version = 2 }, func(m *Message) { m.ExpiresAt = time.Now().Add(-time.Second) }, func(m *Message) { m.ExpiresAt = m.Timestamp.Add(31 * time.Second) }, func(m *Message) { m.Timestamp = time.Now().Add(time.Minute) }, func(m *Message) { m.RequestID = "" }}
	for i, change := range tests {
		m = request()
		change(&m)
		if e := New("d1", []string{"history.read"}).Validate(m, time.Now()); e == nil {
			t.Fatalf("invalid case %d accepted", i)
		}
	}
	if e := New("d1", nil).Validate(request(), time.Now()); e == nil {
		t.Fatal("missing local consent")
	}
}
func TestStrictJSONAndResponseFields(t *testing.T) {
	for _, raw := range []string{`{"version":1,"version":2}`, `{} {}`, `{"params":{"page":1,"page":2}}`, `{"unknown":1}`, `{"payload":null}`, `{"error":null}`, `{"version":1,"type":"HEARTBEAT","device_id":"other"}`, `{"version":1,"type":"HEARTBEAT","device_id":"d1","scope":"x"}`} {
		var m Message
		if e := ValidateIncoming([]byte(raw), &m, "d1"); e == nil {
			t.Fatalf("unsafe JSON accepted %s", raw)
		}
	}
	var m Message
	if e := ValidateIncoming([]byte(`{"version":1,"type":"HEARTBEAT","device_id":"d1"}`), &m, "d1"); e != nil {
		t.Fatal(e)
	}
}
