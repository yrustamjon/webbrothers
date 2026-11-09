//go:build linux

package browser

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/sha1"
	"errors"
	"os/exec"
	"strings"

	"golang.org/x/crypto/pbkdf2"
)

func linuxStorageKey(browserID string, iter int) []byte {
	service := "Chrome Safe Storage"
	switch browserID {
	case "edge":
		service = "Microsoft Edge Safe Storage"
	case "brave":
		service = "Brave Safe Storage"
	}

	pass := "peanuts"
	out, err := exec.Command("secret-tool", "lookup", "service", service).Output()
	if err == nil {
		val := strings.TrimSpace(string(out))
		if val != "" {
			pass = val
		}
	}

	return pbkdf2.Key([]byte(pass), []byte("saltysalt"), iter, 16, sha1.New)
}

func decryptPassword(browserID, profilePath string, encrypted []byte) (string, error) {
	if len(encrypted) < 3 {
		return "", errors.New("Shifrlangan matn juda qisqa")
	}
	prefix := string(encrypted[:3])
	if prefix != "v10" && prefix != "v11" {
		return "", errors.New("Nomaʼlum shifrlash formati: " + prefix)
	}

	ciphertext := trimPrefix(encrypted)
	if len(ciphertext)%aes.BlockSize != 0 || len(ciphertext) == 0 {
		return "", errors.New("Shifrlangan matn uzunligi notoʻgʻri")
	}

	for _, iter := range []int{1, 1003} {
		key := linuxStorageKey(browserID, iter)
		block, err := aes.NewCipher(key)
		if err != nil {
			continue
		}
		iv := []byte("                ") // 16 ta bo'shliq
		mode := cipher.NewCBCDecrypter(block, iv)
		plaintext := make([]byte, len(ciphertext))
		mode.CryptBlocks(plaintext, ciphertext)
		unpadded := unpad(plaintext)
		if len(unpadded) > 0 && len(unpadded) < len(plaintext) {
			return string(unpadded), nil
		}
	}

	return "", errors.New("Linux parolini ochish muvaffaqiyatsiz")
}

func encryptPassword(browserID, profilePath string, plaintext string) ([]byte, error) {
	key := linuxStorageKey(browserID, 1)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	iv := []byte("                ") // 16 ta bo'shliq
	padded := pad([]byte(plaintext), aes.BlockSize)
	ciphertext := make([]byte, len(padded))
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(ciphertext, padded)

	return append([]byte("v10"), ciphertext...), nil
}
