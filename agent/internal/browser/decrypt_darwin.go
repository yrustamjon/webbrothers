//go:build darwin

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

func darwinStorageKey(browserID string) ([]byte, error) {
	service := "Chrome Safe Storage"
	switch browserID {
	case "edge":
		service = "Microsoft Edge Safe Storage"
	case "brave":
		service = "Brave Safe Storage"
	}

	out, err := exec.Command("security", "find-generic-password", "-s", service, "-w").Output()
	if err != nil {
		return nil, errors.New("Keychain ruxsati yoʻq yoki kalit topilmadi")
	}
	safeStorage := strings.TrimSpace(string(out))
	if safeStorage == "" {
		return nil, errors.New("Keychain paroli boʻsh")
	}

	// PBKDF2-HMAC-SHA1: salt="saltysalt", iter=1003, keyLen=16
	key := pbkdf2.Key([]byte(safeStorage), []byte("saltysalt"), 1003, 16, sha1.New)
	return key, nil
}

func decryptPassword(browserID, profilePath string, encrypted []byte) (string, error) {
	if len(encrypted) < 3 {
		return "", errors.New("Shifrlangan matn juda qisqa")
	}
	prefix := string(encrypted[:3])
	if prefix != "v10" && prefix != "v11" {
		return "", errors.New("Nomaʼlum shifrlash formati: " + prefix)
	}

	key, err := darwinStorageKey(browserID)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	iv := []byte("                ") // 16 ta bo'shliq (0x20)
	ciphertext := trimPrefix(encrypted)
	if len(ciphertext)%aes.BlockSize != 0 || len(ciphertext) == 0 {
		return "", errors.New("Shifrlangan matn uzunligi notoʻgʻri")
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	return string(unpad(plaintext)), nil
}

func encryptPassword(browserID, profilePath string, plaintext string) ([]byte, error) {
	key, err := darwinStorageKey(browserID)
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	iv := []byte("                ") // 16 ta bo'shliq (0x20)
	padded := pad([]byte(plaintext), aes.BlockSize)
	ciphertext := make([]byte, len(padded))
	mode := cipher.NewCBCEncrypter(block, iv)
	mode.CryptBlocks(ciphertext, padded)

	return append([]byte("v10"), ciphertext...), nil
}
