package browser

import (
	"context"
	"database/sql"
	"errors"
	"net"
	"net/url"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

type LoginItem struct {
	Domain           string `json:"domain"`
	Username         string `json:"username"`
	CredentialExists bool   `json:"credential_exists"`
}

type InventoryPage struct {
	Items []LoginItem `json:"items"`
}

// Inventory reads saved-login metadata only. It never selects encrypted password
// columns, decrypts credentials, opens cookies/keychains, or copies browser files.
// CredentialExists means a non-blocklisted saved-login record exists; it does not
// assert that its encrypted password can be decrypted or is still valid.
func Inventory(browsers []Browser, browserID, profileID string) (InventoryPage, error) {
	result := InventoryPage{Items: []LoginItem{}}
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
		return result, errors.New("Profil topilmadi yoki ruxsat yoʻq")
	}
	if browserID != "chrome" && browserID != "edge" && browserID != "brave" {
		return result, errors.New("Bu brauzer uchun login metamaʼlumotlari hozircha qoʻllanmaydi")
	}
	file := filepath.Join(path, "Login Data")
	if !within(path, file) {
		return result, errors.New("Login bazasi topilmadi yoki profil ruxsati yoʻq")
	}
	uri, err := historyURI(file)
	if err != nil {
		return result, errors.New("Login bazasi yoʻli yaroqsiz")
	}
	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		return result, errors.New("Login bazasi ochilmadi")
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	// Never use SELECT *: password_value and other secret columns must remain
	// unread. Bound both scanned values and the number of rows before allocation.
	rows, err := db.QueryContext(ctx, `SELECT substr(origin_url,1,8193),substr(COALESCE(username_value,''),1,513)
		FROM logins WHERE blacklisted_by_user=0 ORDER BY origin_url,username_value LIMIT 200`)
	if err != nil {
		return result, errors.New("Login bazasi band yoki sxemasi qoʻllanmaydi")
	}
	defer rows.Close()
	seen := map[LoginItem]bool{}
	for rows.Next() {
		var origin, username sql.NullString
		if err := rows.Scan(&origin, &username); err != nil {
			return InventoryPage{Items: []LoginItem{}}, errors.New("Login metamaʼlumoti oʻqilmadi")
		}
		if !origin.Valid || len(origin.String) > 8192 || len(username.String) > 512 || !utf8.ValidString(username.String) {
			continue
		}
		u, err := url.Parse(origin.String)
		if err != nil || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.Opaque != "" {
			continue
		}
		domain := strings.ToLower(u.Hostname())
		if !inventoryDomain(domain) {
			continue
		}
		item := LoginItem{Domain: domain, Username: username.String, CredentialExists: true}
		if !seen[item] {
			result.Items = append(result.Items, item)
			seen[item] = true
		}
	}
	if rows.Err() != nil {
		return InventoryPage{Items: []LoginItem{}}, errors.New("Login metamaʼlumoti oʻqilmadi")
	}
	return result, nil
}

func inventoryDomain(domain string) bool {
	if domain == "" || len(domain) > 253 {
		return false
	}
	if net.ParseIP(domain) != nil {
		return true
	}
	for _, label := range strings.Split(strings.TrimSuffix(domain, "."), ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, char := range label {
			if (char < 'a' || char > 'z') && (char < '0' || char > '9') && char != '-' {
				return false
			}
		}
	}
	return true
}
