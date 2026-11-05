package protocol

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
)

// Decode rejects duplicate keys, extra documents, unknown fields and deep nesting.
func Decode(data []byte, out any) error {
	if len(data) > MaxPayload {
		return errors.New("Xabar juda katta")
	}
	d := json.NewDecoder(bytes.NewReader(data))
	var scan func(int) error
	scan = func(depth int) error {
		if depth > 16 {
			return errors.New("JSON chuqurligi oshdi")
		}
		t, e := d.Token()
		if e != nil {
			return e
		}
		if depth == 0 && t != json.Delim('{') {
			return errors.New("JSON obyekt talab qilinadi")
		}
		if delim, ok := t.(json.Delim); ok {
			switch delim {
			case '{':
				seen := map[string]bool{}
				for d.More() {
					k, e := d.Token()
					if e != nil {
						return e
					}
					key, ok := k.(string)
					if !ok || seen[key] {
						return errors.New("Takroriy JSON maydoni")
					}
					seen[key] = true
					if e = scan(depth + 1); e != nil {
						return e
					}
				}
				end, e := d.Token()
				if e != nil || end != json.Delim('}') {
					return errors.New("JSON obyekt notoʻgʻri")
				}
			case '[':
				for d.More() {
					if e = scan(depth + 1); e != nil {
						return e
					}
				}
				end, e := d.Token()
				if e != nil || end != json.Delim(']') {
					return errors.New("JSON massiv notoʻgʻri")
				}
			default:
				return errors.New("JSON notoʻgʻri")
			}
		}
		return nil
	}
	if e := scan(0); e != nil {
		return e
	}
	if _, e := d.Token(); e != io.EOF {
		return errors.New("Bitta JSON hujjati talab qilinadi")
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	return decoder.Decode(out)
}
func ValidateIncoming(data []byte, m *Message, device string) error {
	if e := Decode(data, m); e != nil {
		return e
	}
	var fields map[string]json.RawMessage
	if e := json.Unmarshal(data, &fields); e != nil {
		return e
	}
	if _, ok := fields["payload"]; ok {
		return errors.New("Soʻrovda javob mazmuni boʻlmasin")
	}
	if _, ok := fields["error"]; ok {
		return errors.New("Soʻrovda xato maydoni boʻlmasin")
	}
	if m.Type == "STREAM_ACK" || m.Type == "CANCEL_REQUEST" {
		if m.Version != 1 || m.DeviceID != device || m.RequestID == "" || len(m.RequestID) > 128 {
			return errors.New("Boshqaruv identifikatori notoʻgʻri")
		}
		allowed := map[string]bool{"version": true, "type": true, "device_id": true, "request_id": true}
		if m.Type == "STREAM_ACK" {
			allowed["sequence"] = true
			if m.Sequence == nil || *m.Sequence < 0 || *m.Sequence > 4096 {
				return errors.New("ACK ketma-ketligi notoʻgʻri")
			}
		}
		for key := range fields {
			if !allowed[key] {
				return errors.New("Boshqaruv maydoni notoʻgʻri")
			}
		}
		return nil
	}
	if _, ok := fields["sequence"]; ok {
		return errors.New("Soʻrovda stream javob maydoni boʻlmasin")
	}
	if _, ok := fields["final"]; ok {
		return errors.New("Soʻrovda stream javob maydoni boʻlmasin")
	}
	if m.Type == "HEARTBEAT" {
		if m.Version != 1 || m.DeviceID != device {
			return errors.New("Heartbeat identifikatori notoʻgʻri")
		}
		for key := range fields {
			if key != "version" && key != "type" && key != "device_id" && key != "timestamp" {
				return errors.New("Heartbeat maydoni notoʻgʻri")
			}
		}
	}
	return nil
}
