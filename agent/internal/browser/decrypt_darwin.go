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

func decryptPassword(profilePath string, encrypted []byte) (string, error) {
	if len(encrypted) < 3 {
		return "", errors.New("Shifrlangan matn juda qisqa")
	}
	prefix := string(encrypted[:3])
	if prefix != "v10" && prefix != "v11" {
		return "", errors.New("Nomaʼlum shifrlash formati: " + prefix)
	}

	// Keychain'dan "Chrome Safe Storage" parolini olish
	out, err := exec.Command("security", "find-generic-password",
		"-s", "Chrome Safe Storage", "-w").Output()
	if err != nil {
		return "", errors.New("Keychain ruxsati yoʻq yoki kalit topilmadi")
	}
	safeStorage := strings.TrimSpace(string(out))
	if safeStorage == "" {
		return "", errors.New("Keychain paroli boʻsh")
	}

	// PBKDF2-HMAC-SHA1: salt="saltysalt", iter=1003, keyLen=16
	key := pbkdf2.Key([]byte(safeStorage), []byte("saltysalt"), 1003, 16, sha1.New)

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	iv := []byte("                ") // 16 ta bo'shliq (0x20)
	ciphertext := trimPrefix(encrypted)
	if len(ciphertext)%aes.BlockSize != 0 {
		return "", errors.New("Shifrlangan matn uzunligi notoʻgʻri")
	}

	mode := cipher.NewCBCDecrypter(block, iv)
	plaintext := make([]byte, len(ciphertext))
	mode.CryptBlocks(plaintext, ciphertext)

	return string(unpad(plaintext)), nil
}