//go:build windows

package browser

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"unsafe"
)

type localState struct {
	OSCrypt struct {
		EncryptedKey string `json:"encrypted_key"`
	} `json:"os_crypt"`
}

func decryptPassword(profilePath string, encrypted []byte) (string, error) {
	if len(encrypted) < 3 {
		return "", errors.New("Shifrlangan matn juda qisqa")
	}
	prefix := string(encrypted[:3])
	if prefix != "v10" && prefix != "v11" {
		return "", errors.New("Nomaʼlum shifrlash formati")
	}

	// Local State faylidan encrypted_key ni olish
	statePath := filepath.Join(filepath.Dir(profilePath), "Local State")
	data, err := os.ReadFile(statePath)
	if err != nil {
		return "", errors.New("Local State topilmadi")
	}
	var state localState
	if err := json.Unmarshal(data, &state); err != nil {
		return "", errors.New("Local State formati notoʻgʻri")
	}
	if state.OSCrypt.EncryptedKey == "" {
		return "", errors.New("encrypted_key topilmadi")
	}

	// base64 decode + "DPAPI" prefiksini olib tashlash
	raw, err := base64.StdEncoding.DecodeString(state.OSCrypt.EncryptedKey)
	if err != nil {
		return "", errors.New("encrypted_key base64 xato")
	}
	if len(raw) < 5 || string(raw[:5]) != "DPAPI" {
		return "", errors.New("DPAPI prefiksi topilmadi")
	}
	dpapiBlob := raw[5:]

	// DPAPI orqali master key olish
	masterKey, err := dpapiDecrypt(dpapiBlob)
	if err != nil {
		return "", err
	}
	if len(masterKey) != 32 {
		return "", errors.New("Master key uzunligi notoʻgʻri")
	}

	// AES-256-GCM: nonce(12) + ciphertext + tag(16)
	ciphertext := trimPrefix(encrypted)
	if len(ciphertext) < 12+16 {
		return "", errors.New("GCM maʼlumoti juda qisqa")
	}
	nonce := ciphertext[:12]
	payload := ciphertext[12:]

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return "", err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}
	plaintext, err := gcm.Open(nil, nonce, payload, nil)
	if err != nil {
		return "", errors.New("GCM shifrini ochish muvaffaqiyatsiz")
	}
	return string(plaintext), nil
}

// dpapiDecrypt Windows CryptUnprotectData ni chaqiradi.
func dpapiDecrypt(blob []byte) ([]byte, error) {
	var out syscall.DataBlob
	in := syscall.DataBlob{
		Size: uint32(len(blob)),
		Data: &blob[0],
	}
	r, _, err := syscall.NewLazyDLL("crypt32.dll").
		NewProc("CryptUnprotectData").
		Call(
			uintptr(unsafe.Pointer(&in)),
			0, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(&out)),
		)
	if r == 0 {
		return nil, errors.New("DPAPI shifrini ochish muvaffaqiyatsiz: " + err.Error())
	}
	defer syscall.LocalFree(syscall.Handle(unsafe.Pointer(out.Data)))
	result := make([]byte, out.Size)
	copy(result, unsafe.Slice(out.Data, out.Size))
	return result, nil
}