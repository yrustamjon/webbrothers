package browser

import (
	"bytes"
	"database/sql"
	"errors"
	"log"
	"net/url"
	"path/filepath"
	"strings"
	"time"
)

// rwURI creates an SQLite connection URI for read-write operations with a busy timeout.
func rwURI(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	uriPath := filepath.ToSlash(absolute)
	if !strings.HasPrefix(uriPath, "/") {
		uriPath = "/" + uriPath
	}
	uri := url.URL{Scheme: "file", Path: uriPath}
	params := url.Values{"mode": {"rw"}, "_busy_timeout": {"5000"}}
	uri.RawQuery = params.Encode()
	return uri.String(), nil
}

func lockFriendlyError(err error, fallback string) error {
	if err == nil {
		return nil
	}
	if strings.Contains(err.Error(), "database is locked") || strings.Contains(err.Error(), "busy") {
		return errors.New("Brauzer ochiq va profil qulflangan; brauzerni yopib qayta urinib koʻring")
	}
	return errors.New(fallback + ": " + err.Error())
}

func hasColumn(db *sql.DB, tableName, columnName string) bool {
	rows, err := db.Query("PRAGMA table_info(" + tableName + ")")
	if err != nil {
		return false
	}
	defer rows.Close()
	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull, pk int
		var dfltValue any
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dfltValue, &pk); err == nil {
			if strings.EqualFold(name, columnName) {
				return true
			}
		}
	}
	return false
}

// pad PKCS7 padding qoʻshadi (AES-CBC uchun).
func pad(data []byte, blockSize int) []byte {
	padLen := blockSize - (len(data) % blockSize)
	padding := bytes.Repeat([]byte{byte(padLen)}, padLen)
	return append(data, padding...)
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
	for i := len(data) - padLen; i < len(data); i++ {
		if data[i] != byte(padLen) {
			return data
		}
	}
	return data[:len(data)-padLen]
}

// trimPrefix v10/v11 prefiksini olib tashlaydi.
func trimPrefix(data []byte) []byte {
	if len(data) >= 3 && (string(data[:3]) == "v10" || string(data[:3]) == "v11") {
		return data[3:]
	}
	return data
}

// RevealPassword aniq bir domain+username uchun parolni ochadi.
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

	hasSignon := hasColumn(db, "logins", "signon_realm")
	query := `SELECT password_value FROM logins WHERE blacklisted_by_user=0 AND origin_url LIKE ? AND username_value = ? LIMIT 1`
	args := []any{"%" + domain + "%", username}
	if hasSignon {
		query = `SELECT password_value FROM logins WHERE blacklisted_by_user=0 AND (origin_url LIKE ? OR signon_realm LIKE ?) AND username_value = ? LIMIT 1`
		args = []any{"%" + domain + "%", "%" + domain + "%", username}
	}

	var encrypted []byte
	err = db.QueryRow(query, args...).Scan(&encrypted)
	if err != nil {
		return "", errors.New("Parol topilmadi")
	}
	if len(encrypted) == 0 {
		return "", errors.New("Parol boʻsh")
	}

	return decryptPassword(browserID, path, encrypted)
}

// SavePassword yangi yoki mavjud login/parolni brauzerning Login Data jadvaliga shifrlab yozadi.
func SavePassword(browsers []Browser, browserID, profileID, domain, username, password string) error {
	domain = strings.TrimSpace(domain)
	username = strings.TrimSpace(username)
	if domain == "" {
		return errors.New("Sayt domeni kiritilmadi")
	}
	if username == "" {
		return errors.New("Foydalanuvchi nomi yoki email kiritilmadi")
	}
	if password == "" {
		return errors.New("Parol kiritilmadi")
	}

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
		return errors.New("Profil topilmadi yoki ruxsat yoʻq")
	}
	if browserID != "chrome" && browserID != "edge" && browserID != "brave" {
		return errors.New("Bu brauzer uchun parol saqlash hozircha qoʻllanmaydi")
	}

	file := filepath.Join(path, "Login Data")
	if !within(path, file) {
		return errors.New("Login bazasi topilmadi")
	}

	encrypted, err := encryptPassword(browserID, path, password)
	if err != nil {
		return errors.New("Parolni shifrlashda xatolik: " + err.Error())
	}

	uri, err := rwURI(file)
	if err != nil {
		return errors.New("Login bazasi yoʻli yaroqsiz")
	}

	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		return errors.New("Login bazasi ochilmadi")
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	originURL := domain
	if !strings.HasPrefix(originURL, "http://") && !strings.HasPrefix(originURL, "https://") {
		originURL = "https://" + originURL
	}
	if !strings.HasSuffix(originURL, "/") {
		originURL += "/"
	}
	signonRealm := originURL
	actionURL := originURL

	// Microseconds since 1601-01-01 (Chromium epoch)
	chromeEpoch := (time.Now().Unix() + 11644473600) * 1000000

	hasSignon := hasColumn(db, "logins", "signon_realm")
	countQuery := `SELECT COUNT(*) FROM logins WHERE origin_url LIKE ? AND username_value = ?`
	countArgs := []any{"%" + domain + "%", username}
	if hasSignon {
		countQuery = `SELECT COUNT(*) FROM logins WHERE (origin_url LIKE ? OR signon_realm LIKE ?) AND username_value = ?`
		countArgs = []any{"%" + domain + "%", "%" + domain + "%", username}
	}

	var count int
	err = db.QueryRow(countQuery, countArgs...).Scan(&count)
	if err != nil {
		return lockFriendlyError(err, "Login bazasini tekshirib boʻlmadi")
	}

	if count > 0 {
		updateQuery := `UPDATE logins SET password_value = ? WHERE origin_url LIKE ? AND username_value = ?`
		updateArgs := []any{encrypted, "%" + domain + "%", username}
		if hasSignon {
			updateQuery = `UPDATE logins SET password_value = ? WHERE (origin_url LIKE ? OR signon_realm LIKE ?) AND username_value = ?`
			updateArgs = []any{encrypted, "%" + domain + "%", "%" + domain + "%", username}
		}
		_, err = db.Exec(updateQuery, updateArgs...)
		if err != nil {
			return lockFriendlyError(err, "Parolni yangilash muvaffaqiyatsiz")
		}
	} else {
		_, err = db.Exec(
			`INSERT INTO logins (origin_url, action_url, username_element, username_value, password_element, password_value, signon_realm, date_created, blacklisted_by_user, scheme)
			 VALUES (?, ?, '', ?, '', ?, ?, ?, 0, 0)`,
			originURL, actionURL, username, encrypted, signonRealm, chromeEpoch,
		)
		if err != nil {
			_, err = db.Exec(
				`INSERT INTO logins (origin_url, username_value, blacklisted_by_user, password_value)
				 VALUES (?, ?, 0, ?)`,
				originURL, username, encrypted,
			)
			if err != nil {
				return lockFriendlyError(err, "Parolni saqlash muvaffaqiyatsiz")
			}
		}
	}

	return nil
}

// DeletePassword login yozuvini Login Data bazasidan oʻchiradi.
func DeletePassword(browsers []Browser, browserID, profileID, domain, username string) error {
	domain = strings.TrimSpace(domain)
	username = strings.TrimSpace(username)
	if domain == "" || username == "" {
		return errors.New("Domen yoki foydalanuvchi nomi koʻrsatilmadi")
	}

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
		return errors.New("Profil topilmadi yoki ruxsat yoʻq")
	}
	if browserID != "chrome" && browserID != "edge" && browserID != "brave" {
		return errors.New("Bu brauzer uchun parol oʻchirish hozircha qoʻllanmaydi")
	}

	file := filepath.Join(path, "Login Data")
	if !within(path, file) {
		return errors.New("Login bazasi topilmadi")
	}

	uri, err := rwURI(file)
	if err != nil {
		return errors.New("Login bazasi yoʻli yaroqsiz")
	}

	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		return errors.New("Login bazasi ochilmadi")
	}
	defer db.Close()
	db.SetMaxOpenConns(1)

	hasSignon := hasColumn(db, "logins", "signon_realm")
	delQuery := `DELETE FROM logins WHERE origin_url LIKE ? AND username_value = ?`
	delArgs := []any{"%" + domain + "%", username}
	if hasSignon {
		delQuery = `DELETE FROM logins WHERE (origin_url LIKE ? OR signon_realm LIKE ?) AND username_value = ?`
		delArgs = []any{"%" + domain + "%", "%" + domain + "%", username}
	}

	res, err := db.Exec(delQuery, delArgs...)
	if err != nil {
		return lockFriendlyError(err, "Loginni oʻchirish muvaffaqiyatsiz")
	}
	affected, _ := res.RowsAffected()
	if affected == 0 {
		return errors.New("Oʻchirish uchun bunday login topilmadi")
	}
	return nil
}

// RevealPasswordAudited audit qaydini yozib parolni ochadi.
func RevealPasswordAudited(browsers []Browser, browserID, profileID, domain, username, requestedBy string) (string, error) {
	log.Printf("AUDIT: %s revealed password for %s@%s (browser=%s, profile=%s)",
		requestedBy, username, domain, browserID, profileID)
	return RevealPassword(browsers, browserID, profileID, domain, username)
}
