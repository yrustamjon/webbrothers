//go:build windows

package browser

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
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

func windowsMasterKey(profilePath string) ([]byte, error) {
	statePath := filepath.Join(filepath.Dir(profilePath), "Local State")
	data, err := os.ReadFile(statePath)
	if err != nil {
		statePath = filepath.Join(profilePath, "Local State")
		data, err = os.ReadFile(statePath)
		if err != nil {
			return nil, errors.New("Local State fayli topilmadi")
		}
	}

	var state localState
	if err := json.Unmarshal(data, &state); err != nil {
		return nil, errors.New("Local State formati notoʻgʻri")
	}
	if state.OSCrypt.EncryptedKey == "" {
		return nil, errors.New("Local State ichida encrypted_key topilmadi")
	}

	raw, err := base64.StdEncoding.DecodeString(state.OSCrypt.EncryptedKey)
	if err != nil {
		return nil, errors.New("encrypted_key base64 ochilmadi")
	}
	if len(raw) < 5 || string(raw[:5]) != "DPAPI" {
		return nil, errors.New("DPAPI prefiksi topilmadi")
	}
	dpapiBlob := raw[5:]

	masterKey, err := dpapiDecrypt(dpapiBlob)
	if err != nil {
		return nil, err
	}
	if len(masterKey) != 32 {
		return nil, errors.New("Master key uzunligi notoʻgʻri")
	}
	return masterKey, nil
}

type dataBlob struct {
	cbData uint32
	pbData *byte
}

func dpapiDecrypt(blob []byte) ([]byte, error) {
	if len(blob) == 0 {
		return nil, errors.New("DPAPI bloki boʻsh")
	}
	var out dataBlob
	in := dataBlob{
		cbData: uint32(len(blob)),
		pbData: &blob[0],
	}
	r, _, err := syscall.NewLazyDLL("crypt32.dll").
		NewProc("CryptUnprotectData").
		Call(
			uintptr(unsafe.Pointer(&in)),
			0, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(&out)),
		)
	if r == 0 {
		return nil, errors.New("DPAPI ochish xatosi: " + err.Error())
	}
	defer syscall.LocalFree(syscall.Handle(unsafe.Pointer(out.pbData)))
	result := make([]byte, out.cbData)
	copy(result, unsafe.Slice(out.pbData, out.cbData))
	return result, nil
}

func decryptPassword(browserID, profilePath string, encrypted []byte) (string, error) {
	if len(encrypted) < 3 {
		return "", errors.New("Shifrlangan matn juda qisqa")
	}
	prefix := string(encrypted[:3])
	if prefix != "v10" && prefix != "v11" {
		plain, err := dpapiDecrypt(encrypted)
		if err == nil {
			return string(plain), nil
		}
		return "", errors.New("Nomaʼlum shifrlash formati: " + prefix)
	}

	masterKey, err := windowsMasterKey(profilePath)
	if err != nil {
		return "", err
	}

	ciphertext := trimPrefix(encrypted)
	if len(ciphertext) < 12+16 {
		return "", errors.New("AES-GCM maʼlumoti juda qisqa")
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
		return "", errors.New("AES-GCM shifrini ochish muvaffaqiyatsiz")
	}
	return string(plaintext), nil
}

func encryptPassword(browserID, profilePath string, plaintext string) ([]byte, error) {
	masterKey, err := windowsMasterKey(profilePath)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(masterKey)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}

	sealed := gcm.Seal(nil, nonce, []byte(plaintext), nil)
	result := append([]byte("v10"), nonce...)
	result = append(result, sealed...)
	return result, nil
}
