package browser

import (
	"database/sql"
	"errors"
	"path/filepath"
	"log"
	"strings"
)

// RevealPassword faqat aniq bir domain+username uchun parolni ochadi.
// Bu funksiya faqat foydalanuvchi aniq so'raganda chaqirilishi kerak.
// Har bir chaqiruv audit jurnaliga yozilishi tavsiya etiladi.
func RevealPassword(browsers []Browser, browserID, profileID, domain, username string) (string, error) {
	var path string
	for _, browser := range browsers {
		if browser.ID != browserID {
			continue
		}
		for _, profile := range browser.Profiles {
			if profile.ID == profileID {
				path = profile.Path
			}
		}
	}
	if path == "" {
		return "", errors.New("Profil topilmadi yoki ruxsat yoʻq")
	}
	if browserID != "chrome" && browserID != "edge" && browserID != "brave" {
		return "", errors.New("Bu brauzer uchun parol ochish qoʻllanmaydi")
	}

	file := filepath.Join(path, "Login Data")
	if !within(path, file) {
		return "", errors.New("Login bazasi topilmadi")
	}
	uri, err := historyURI(file)
	if err != nil {
		return "", errors.New("Login bazasi yoʻli yaroqsiz")
	}

	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		return "", errors.New("Login bazasi ochilmadi")
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	var encrypted []byte
	err = db.QueryRow(
		`SELECT password_value FROM logins
		 WHERE blacklisted_by_user=0
		 AND origin_url LIKE ?
		 AND username_value = ?
		 LIMIT 1`,
		"%"+domain+"%", username,
	).Scan(&encrypted)
	if err != nil {
		return "", errors.New("Parol topilmadi")
	}
	if len(encrypted) == 0 {
		return "", errors.New("Parol boʻsh")
	}

	return decryptPassword(path, encrypted)
}

// unpad PKCS7 paddingni olib tashlaydi (AES-CBC uchun).
func unpad(data []byte) []byte {
	if len(data) == 0 {
		return data
	}
	padLen := int(data[len(data)-1])
	if padLen > len(data) || padLen == 0 {
		return data
	}
	return data[:len(data)-padLen]
}

// trimPrefix v10/v11 prefiksini olib tashlaydi.
func trimPrefix(data []byte) []byte {
	if len(data) >= 3 && string(data[:3]) == "v10" {
		return data[3:]
	}
	if len(data) >= 3 && string(data[:3]) == "v11" {
		return data[3:]
	}
	return data
}

// reveal.go ga qo'shish
func RevealPasswordAudited(browsers []Browser, browserID, profileID, domain, username, requestedBy string) (string, error) {
	// audit log yozish
	log.Printf("AUDIT: %s revealed password for %s@%s (browser=%s, profile=%s)",
		requestedBy, username, domain, browserID, profileID)
	return RevealPassword(browsers, browserID, profileID, domain, username)
}

var _ = strings.TrimSpace // import ishlatilishi uchun
