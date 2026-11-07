//go:build linux

package browser

import "errors"

func decryptPassword(profilePath string, encrypted []byte) (string, error) {
	return "", errors.New("Parol ochish Linux'da hozircha qoʻllanmaydi")
}