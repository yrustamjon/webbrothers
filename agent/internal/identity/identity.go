// Package identity stores private identity and bearer credentials encrypted at rest.
package identity

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/ed25519"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
)

type Identity struct {
	DeviceID   string   `json:"device_id"`
	Token      string   `json:"token"`
	PrivateKey []byte   `json:"private_key"`
	Scopes     []string `json:"scopes"`
}
type envelope struct {
	Salt  []byte `json:"salt"`
	Nonce []byte `json:"nonce"`
	Data  []byte `json:"data"`
}

func New() (Identity, error) {
	_, k, e := ed25519.GenerateKey(rand.Reader)
	return Identity{PrivateKey: k}, e
}
func (i Identity) PublicKey() string {
	if len(i.PrivateKey) != ed25519.PrivateKeySize {
		return ""
	}
	return base64.StdEncoding.EncodeToString(ed25519.PrivateKey(i.PrivateKey).Public().(ed25519.PublicKey))
}

// PBKDF2-HMAC-SHA256 with 600,000 iterations; a local passphrase is mandatory.
func derive(password string, salt []byte) []byte {
	h := hmac.New(sha256.New, []byte(password))
	h.Write(salt)
	h.Write([]byte{0, 0, 0, 1})
	u := h.Sum(nil)
	out := append([]byte(nil), u...)
	for n := 1; n < 600000; n++ {
		h.Reset()
		h.Write(u)
		u = h.Sum(nil)
		for j := range out {
			out[j] ^= u[j]
		}
	}
	return out
}
func seal(pass string, salt []byte) (cipher.AEAD, error) {
	if len(pass) < 16 {
		return nil, errors.New("Mahalliy kalit paroli kamida 16 belgidan iborat boʻlsin")
	}
	b, e := aes.NewCipher(derive(pass, salt))
	if e != nil {
		return nil, e
	}
	return cipher.NewGCM(b)
}
func Save(path, pass string, i Identity) error {
	salt := make([]byte, 16)
	if _, e := rand.Read(salt); e != nil {
		return e
	}
	a, e := seal(pass, salt)
	if e != nil {
		return e
	}
	nonce := make([]byte, a.NonceSize())
	if _, e = rand.Read(nonce); e != nil {
		return e
	}
	p, e := json.Marshal(i)
	if e != nil {
		return e
	}
	v, e := json.Marshal(envelope{salt, nonce, a.Seal(nil, nonce, p, []byte("browser-agent-v1"))})
	if e != nil {
		return e
	}
	if e = os.MkdirAll(filepath.Dir(path), 0700); e != nil {
		return e
	}
	f, e := os.OpenFile(path+".tmp", os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if e != nil {
		return e
	}
	defer os.Remove(path + ".tmp")
	if _, e = f.Write(v); e != nil {
		f.Close()
		return e
	}
	if e = f.Sync(); e != nil {
		f.Close()
		return e
	}
	if e = f.Close(); e != nil {
		return e
	}
	return os.Rename(path+".tmp", path)
}
func Load(path, pass string) (Identity, error) {
	var i Identity
	v, e := os.ReadFile(path)
	if e != nil {
		return i, e
	}
	var box envelope
	if e = json.Unmarshal(v, &box); e != nil {
		return i, errors.New("Kalit fayli buzilgan")
	}
	if len(box.Salt) != 16 {
		return i, errors.New("Kalit fayli buzilgan")
	}
	a, e := seal(pass, box.Salt)
	if e != nil {
		return i, e
	}
	if len(box.Nonce) != a.NonceSize() {
		return i, errors.New("Kalit fayli buzilgan")
	}
	plain, e := a.Open(nil, box.Nonce, box.Data, []byte("browser-agent-v1"))
	if e != nil {
		return i, errors.New("Mahalliy kalit paroli notoʻgʻri yoki fayl buzilgan")
	}
	e = json.Unmarshal(plain, &i)
	if len(i.PrivateKey) != ed25519.PrivateKeySize {
		return Identity{}, errors.New("Qurilma kaliti notoʻgʻri")
	}
	return i, e
}
