package identity

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestEncryptedRoundtripWrongPasswordAndTamper(t *testing.T) {
	i, e := New()
	if e != nil {
		t.Fatal(e)
	}
	i.Token = "device-secret-never-plaintext"
	i.DeviceID = "d1"
	p := filepath.Join(t.TempDir(), "id.enc")
	pass := "long-test-passphrase"
	if e = Save(p, pass, i); e != nil {
		t.Fatal(e)
	}
	raw, _ := os.ReadFile(p)
	if bytes.Contains(raw, []byte(i.Token)) || bytes.Contains(raw, i.PrivateKey) {
		t.Fatal("plaintext secret")
	}
	got, e := Load(p, pass)
	if e != nil || got.Token != i.Token || got.PublicKey() != i.PublicKey() {
		t.Fatalf("roundtrip %v", e)
	}
	if _, e = Load(p, "wrong-long-password"); e == nil {
		t.Fatal("wrong password accepted")
	}
	raw[len(raw)/2] ^= 1
	os.WriteFile(p, raw, 0600)
	if _, e = Load(p, pass); e == nil {
		t.Fatal("tamper accepted")
	}
	if e = Save(p, "short", i); e == nil {
		t.Fatal("weak password")
	}
}
