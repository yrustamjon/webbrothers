package protocol

import (
	"encoding/json"
	"errors"
	"time"
)

const MaxPayload = 1 << 20

var Scopes = map[string]string{"BROWSER_LIST_REQUEST": "browser.discovery", "PROFILE_LIST_REQUEST": "profile.discovery", "HISTORY_QUERY": "history.read", "LOGIN_INVENTORY_QUERY": "login.inventory", "TRAFFIC_STATS_REQUEST": "traffic.aggregate"}
var Responses = map[string]string{"BROWSER_LIST_REQUEST": "BROWSER_LIST_RESPONSE", "PROFILE_LIST_REQUEST": "PROFILE_LIST_RESPONSE", "HISTORY_QUERY": "HISTORY_RESPONSE", "LOGIN_INVENTORY_QUERY": "LOGIN_INVENTORY_RESPONSE", "TRAFFIC_STATS_REQUEST": "TRAFFIC_STATS_RESPONSE"}

type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}
type Message struct {
	Version   int             `json:"version"`
	RequestID string          `json:"request_id"`
	DeviceID  string          `json:"device_id"`
	Type      string          `json:"type"`
	Timestamp time.Time       `json:"timestamp"`
	ExpiresAt time.Time       `json:"expires_at"`
	Scope     string          `json:"scope"`
	Params    json.RawMessage `json:"params,omitempty"`
	Payload   any             `json:"payload,omitempty"`
	Error     *Error          `json:"error,omitempty"`
}
type Validator struct {
	DeviceID string
	Allowed  map[string]bool
	seen     map[string]time.Time
}

func New(id string, scopes []string) *Validator {
	a := map[string]bool{}
	for _, s := range scopes {
		a[s] = true
	}
	return &Validator{DeviceID: id, Allowed: a, seen: map[string]time.Time{}}
}
func (v *Validator) Validate(m Message, now time.Time) error {
	scope, ok := Scopes[m.Type]
	if !ok {
		return errors.New("Soʻrov turi qoʻllanmaydi")
	}
	if m.Version != 1 || m.DeviceID != v.DeviceID || m.RequestID == "" || len(m.RequestID) > 128 || scope != m.Scope || !v.Allowed[scope] {
		return errors.New("Soʻrovga ruxsat yoʻq")
	}
	if !m.ExpiresAt.After(m.Timestamp) || !m.ExpiresAt.After(now) || m.Timestamp.After(now.Add(5*time.Second)) || m.Timestamp.Before(now.Add(-30*time.Second)) || m.ExpiresAt.Sub(m.Timestamp) > 30*time.Second {
		return errors.New("Soʻrov muddati tugagan")
	}
	for id, t := range v.seen {
		if !t.After(now) {
			delete(v.seen, id)
		}
	}
	if _, ok = v.seen[m.RequestID]; ok {
		return errors.New("Takroriy soʻrov rad etildi")
	}
	if len(v.seen) >= 1024 {
		return errors.New("Soʻrovlar chegarasi oshdi")
	}
	v.seen[m.RequestID] = m.ExpiresAt
	return nil
}
