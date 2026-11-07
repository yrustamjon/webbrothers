//go:build windows

package browser

import "errors"

// decryptPassword Windows'da hozircha qo'llanmaydi.
// DPAPI va AES-GCM implementatsiyasi keyinchalik qo'shiladi.
func decryptPassword(profilePath string, encrypted []byte) (string, error) {
	return "", errors.New("Parol ochish Windows'da hozircha qoʻllanmaydi")
}