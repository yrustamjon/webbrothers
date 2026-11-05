package browser

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"math"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

var cursorSecret struct {
	sync.Once
	key [32]byte
	err error
}

type queryCursor struct {
	Fingerprint string `json:"f"`
	Binding     string `json:"b"`
	Position    string `json:"t"`
	RowID       int64  `json:"r"`
	Expires     int64  `json:"e"`
}

func cursorKey() ([]byte, error) {
	cursorSecret.Do(func() { _, cursorSecret.err = rand.Read(cursorSecret.key[:]) })
	if cursorSecret.err != nil {
		return nil, errors.New("Kursor kaliti yaratilmagan")
	}
	return cursorSecret.key[:], nil
}
func encodeCursor(value queryCursor) (*string, error) {
	key, err := cursorKey()
	if err != nil {
		return nil, err
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(raw)
	token := base64.RawURLEncoding.EncodeToString(raw) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return &token, nil
}
func decodeCursor(token, fingerprint, binding string) (queryCursor, error) {
	var value queryCursor
	fail := errors.New("Kursor yaroqsiz yoki eskirgan; birinchi sahifadan qayta boshlang")
	if len(token) > 2048 {
		return value, fail
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return value, fail
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return value, fail
	}
	proof, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return value, fail
	}
	key, err := cursorKey()
	if err != nil {
		return value, err
	}
	mac := hmac.New(sha256.New, key)
	mac.Write(raw)
	if !hmac.Equal(proof, mac.Sum(nil)) {
		return value, fail
	}
	decoder := json.NewDecoder(strings.NewReader(string(raw)))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&value) != nil {
		return queryCursor{}, fail
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		return queryCursor{}, fail
	}
	if value.Fingerprint != fingerprint || value.Binding != binding || value.Expires <= time.Now().Unix() || value.Expires > time.Now().Add(6*time.Minute).Unix() || value.RowID < 1 {
		return queryCursor{}, fail
	}
	return value, nil
}

func normalizeQuery(q Query) (Query, error) {
	if q.Page == 0 {
		q.Page = 1
	}
	if q.PageSize == 0 {
		q.PageSize = 50
	}
	if q.Sort == "" {
		q.Sort = "desc"
	}
	if q.Page < 1 || q.Page > 100000 || q.PageSize < 1 || q.PageSize > 200 || len(q.Search) > 512 || len(q.Cursor) > 2048 || (q.Sort != "asc" && q.Sort != "desc") {
		return q, errors.New("Soʻrov chegarasi notoʻgʻri")
	}
	if (q.Stream || q.Cursor != "") && q.PageSize != 20 && q.PageSize != 50 && q.PageSize != 100 {
		return q, errors.New("Sahifa hajmi 20, 50 yoki 100 boʻlsin")
	}
	if q.Cursor != "" && q.Page != 1 {
		return q, errors.New("Kursor bilan sahifa raqamini aralashtirmang")
	}
	for _, date := range []string{q.Start, q.End} {
		if date != "" {
			if _, err := time.Parse(time.RFC3339, date); err != nil {
				return q, errors.New("Sana formati notoʻgʻri")
			}
		}
	}
	if q.Start != "" && q.End != "" {
		start, _ := time.Parse(time.RFC3339, q.Start)
		end, _ := time.Parse(time.RFC3339, q.End)
		if start.After(end) {
			return q, errors.New("Sana oraligʻi notoʻgʻri")
		}
	}
	return q, nil
}
func profilePath(browsers []Browser, q Query) (string, error) {
	for _, br := range browsers {
		if br.ID == q.BrowserID {
			for _, profile := range br.Profiles {
				if profile.ID == q.ProfileID {
					return profile.Path, nil
				}
			}
		}
	}
	return "", errors.New("Profil topilmadi yoki ruxsat yoʻq")
}
func sourceFile(browsers []Browser, q Query, category string) (string, error) {
	profile, err := profilePath(browsers, q)
	if err != nil {
		return "", err
	}
	name := "History"
	if category == "inventory" {
		if q.BrowserID != "chrome" && q.BrowserID != "edge" && q.BrowserID != "brave" {
			return "", errors.New("Bu brauzer uchun login metamaʼlumotlari hozircha qoʻllanmaydi")
		}
		name = "Login Data"
	} else if category == "history" {
		switch q.BrowserID {
		case "firefox":
			name = "places.sqlite"
		case "safari":
			name = "History.db"
		case "chrome", "edge", "brave":
		default:
			return "", errors.New("Brauzer qoʻllanmaydi")
		}
	} else {
		return "", errors.New("Maʼlumot turi notoʻgʻri")
	}
	file := filepath.Join(profile, name)
	if !within(profile, file) {
		return "", errors.New("Brauzer bazasi topilmadi yoki OS oʻqish ruxsatini bermadi")
	}
	for _, sidecar := range []string{file + "-wal", file + "-shm"} {
		if _, statErr := os.Lstat(sidecar); statErr == nil && !within(profile, sidecar) {
			return "", errors.New("Brauzer bazasi yordamchi fayliga ruxsat yoʻq")
		} else if statErr != nil && !os.IsNotExist(statErr) {
			return "", errors.New("Brauzer bazasi yordamchi faylini tekshirib boʻlmadi")
		}
	}
	return file, nil
}
func sourceFingerprint(file string) (string, error) {
	resolved, err := filepath.EvalSymlinks(file)
	if err != nil {
		return "", errors.New("Manba topilmadi")
	}
	digest := sha256.New()
	digest.Write([]byte(resolved))
	for _, name := range []string{file, file + "-wal"} {
		info, err := os.Stat(name)
		if err != nil {
			if os.IsNotExist(err) && name != file {
				digest.Write([]byte("absent-wal"))
				continue
			}
			return "", errors.New("Manba holatini oʻqib boʻlmadi")
		}
		if !info.Mode().IsRegular() {
			return "", errors.New("Manba oddiy fayl emas")
		}
		digest.Write([]byte(strconv.FormatInt(info.Size(), 10) + ":" + strconv.FormatInt(info.ModTime().UnixNano(), 10)))
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}
func queryBinding(q Query, category string) string {
	value := struct {
		Browser, Profile, Search, Start, End, Sort, Category string
		Size                                                 int
	}{q.BrowserID, q.ProfileID, q.Search, q.Start, q.End, q.Sort, category, q.PageSize}
	raw, _ := json.Marshal(value)
	hash := sha256.Sum256(raw)
	return hex.EncodeToString(hash[:])
}

// QueryFingerprint is a non-content cache key. It changes on source/WAL writes,
// source removal, filters, page size, cursor or category; it contains no paths.
func QueryFingerprint(browsers []Browser, q Query, category string) string {
	normalized, err := normalizeQuery(q)
	if err != nil {
		return ""
	}
	q = normalized
	file, err := sourceFile(browsers, q, category)
	if err != nil {
		return ""
	}
	stamp, err := sourceFingerprint(file)
	if err != nil {
		return ""
	}
	sum := sha256.Sum256([]byte(stamp + queryBinding(q, category) + q.Cursor + strconv.Itoa(q.Page)))
	return hex.EncodeToString(sum[:])
}
func openSource(ctx context.Context, file string) (*sql.DB, error) {
	uri, err := historyURI(file)
	if err != nil {
		return nil, errors.New("Manba yoʻli yaroqsiz")
	}
	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		return nil, errors.New("Manba ochilmadi")
	}
	db.SetMaxOpenConns(1)
	if err := db.PingContext(ctx); err != nil {
		db.Close()
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		return nil, errors.New("Manba band yoki OS oʻqish ruxsatini bermadi")
	}
	return db, nil
}
func queryError(ctx context.Context) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	return errors.New("Brauzer bazasi band yoki sxemasi qoʻllanmaydi")
}
func escapedSearch(value string) string {
	return "%" + strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(value) + "%"
}

type historySchema struct {
	from, timestamp, url, title, count, key string
	safari                                  bool
	epoch                                   int64
}

func schemaFor(browser string) historySchema {
	switch browser {
	case "firefox":
		return historySchema{from: "moz_places", timestamp: "last_visit_date", url: "url", title: "COALESCE(title,'')", count: "COALESCE(visit_count,0)", key: "rowid"}
	case "safari":
		return historySchema{from: "history_visits v JOIN history_items i ON i.id=v.history_item", timestamp: "v.visit_time", url: "i.url", title: "COALESCE(v.title,'')", count: "COALESCE(i.visit_count,0)", key: "v.id", safari: true, epoch: safariEpoch}
	default:
		return historySchema{from: "urls", timestamp: "last_visit_time", url: "url", title: "COALESCE(title,'')", count: "COALESCE(visit_count,0)", key: "rowid", epoch: 11644473600000000}
	}
}

func HistoryContext(parent context.Context, browsers []Browser, q Query) (Page, error) {
	result := Page{Items: []Visit{}}
	var err error
	q, err = normalizeQuery(q)
	if err != nil {
		return result, err
	}
	result.Page, result.PageSize = q.Page, q.PageSize
	file, err := sourceFile(browsers, q, "history")
	if err != nil {
		return result, err
	}
	stamp, err := sourceFingerprint(file)
	if err != nil {
		return result, err
	}
	binding := queryBinding(q, "history")
	var cursor queryCursor
	if q.Cursor != "" {
		cursor, err = decodeCursor(q.Cursor, stamp, binding)
		if err != nil {
			return result, err
		}
	}
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	db, err := openSource(ctx, file)
	if err != nil {
		return result, err
	}
	defer db.Close()
	schema := schemaFor(q.BrowserID)
	query := "SELECT substr(" + schema.url + ",1,8192),substr(" + schema.title + ",1,2048)," + schema.timestamp + "," + schema.count + "," + schema.key + " FROM " + schema.from + " WHERE " + schema.timestamp + " IS NOT NULL AND (" + schema.url + ` LIKE ? ESCAPE '\' OR ` + schema.title + ` LIKE ? ESCAPE '\')`
	args := []any{escapedSearch(q.Search), escapedSearch(q.Search)}
	for _, filter := range []struct{ value, op string }{{q.Start, ">="}, {q.End, "<="}} {
		if filter.value != "" {
			date, _ := time.Parse(time.RFC3339, filter.value)
			query += " AND " + schema.timestamp + filter.op + "?"
			if schema.safari {
				args = append(args, float64(date.Unix()-schema.epoch)+float64(date.Nanosecond())/1e9)
			} else {
				args = append(args, date.UnixMicro()+schema.epoch)
			}
		}
	}
	order, comparison := "DESC", "<"
	if q.Sort == "asc" {
		order, comparison = "ASC", ">"
	}
	if q.Cursor != "" {
		query += " AND (" + schema.timestamp + "," + schema.key + ") " + comparison + " (?,?)"
		if schema.safari {
			position, e := strconv.ParseFloat(cursor.Position, 64)
			if e != nil || math.IsNaN(position) || math.IsInf(position, 0) {
				return result, errors.New("Kursor vaqti yaroqsiz")
			}
			args = append(args, position, cursor.RowID)
		} else {
			position, e := strconv.ParseInt(cursor.Position, 10, 64)
			if e != nil {
				return result, errors.New("Kursor vaqti yaroqsiz")
			}
			args = append(args, position, cursor.RowID)
		}
	}
	query += " ORDER BY " + schema.timestamp + " " + order + "," + schema.key + " " + order + " LIMIT ?"
	args = append(args, q.PageSize+1)
	if q.Cursor == "" && q.Page > 1 {
		query += " OFFSET ?"
		args = append(args, (q.Page-1)*q.PageSize)
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return result, queryError(ctx)
	}
	defer rows.Close()
	var lastPosition string
	var lastRow int64
	for rows.Next() {
		var item Visit
		var rowID int64
		var number sql.NullInt64
		var seconds sql.NullFloat64
		var stampTarget any = &number
		if schema.safari {
			stampTarget = &seconds
		}
		if err := rows.Scan(&item.URL, &item.Title, stampTarget, &item.VisitCount, &rowID); err != nil {
			return result, queryError(ctx)
		}
		if len(result.Items) == q.PageSize {
			result.HasMore = true
			break
		}
		if item.VisitCount < 0 {
			item.VisitCount = 0
		}
		if schema.safari {
			if seconds.Valid {
				if math.IsNaN(seconds.Float64) || math.IsInf(seconds.Float64, 0) || math.Abs(seconds.Float64) > 253402300799 {
					return result, errors.New("Safari tashrif vaqti yaroqsiz")
				}
				whole, fraction := math.Modf(seconds.Float64)
				item.VisitedAt = time.Unix(int64(whole)+schema.epoch, int64(math.Round(fraction*1e9))).UTC().Format(time.RFC3339Nano)
			}
			lastPosition = strconv.FormatFloat(seconds.Float64, 'g', -1, 64)
		} else {
			if number.Valid && number.Int64 != 0 {
				item.VisitedAt = time.UnixMicro(number.Int64 - schema.epoch).UTC().Format(time.RFC3339Nano)
			}
			lastPosition = strconv.FormatInt(number.Int64, 10)
		}
		if parsed, e := url.Parse(item.URL); e == nil {
			item.Domain = parsed.Hostname()
		}
		lastRow = rowID
		result.Items = append(result.Items, item)
	}
	if rows.Err() != nil {
		return result, queryError(ctx)
	}
	current, err := sourceFingerprint(file)
	if err != nil || current != stamp {
		return Page{Items: []Visit{}}, errors.New("Manba yangilandi; birinchi sahifadan qayta boshlang")
	}
	if result.HasMore {
		result.NextCursor, err = encodeCursor(queryCursor{Fingerprint: stamp, Binding: binding, Position: lastPosition, RowID: lastRow, Expires: time.Now().Add(5 * time.Minute).Unix()})
		if err != nil {
			return result, err
		}
	}
	return result, nil
}

func InventoryQueryContext(parent context.Context, browsers []Browser, q Query) (InventoryPage, error) {
	result := InventoryPage{Items: []LoginItem{}}
	var err error
	q, err = normalizeQuery(q)
	if err != nil {
		return result, err
	}
	result.PageSize = q.PageSize
	if q.Start != "" || q.End != "" {
		return result, errors.New("Login inventari sana filtrini qoʻllamaydi")
	}
	file, err := sourceFile(browsers, q, "inventory")
	if err != nil {
		return result, err
	}
	stamp, err := sourceFingerprint(file)
	if err != nil {
		return result, err
	}
	binding := queryBinding(q, "inventory")
	var cursor queryCursor
	if q.Cursor != "" {
		cursor, err = decodeCursor(q.Cursor, stamp, binding)
		if err != nil {
			return result, err
		}
	}
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	db, err := openSource(ctx, file)
	if err != nil {
		return result, err
	}
	defer db.Close()
	// Source-side seek/limit never selects password_value or any credential blob.
	query := `SELECT substr(origin_url,1,8193),substr(COALESCE(username_value,''),1,513),rowid FROM logins WHERE blacklisted_by_user=0 AND (origin_url LIKE ? ESCAPE '\' OR username_value LIKE ? ESCAPE '\')`
	args := []any{escapedSearch(q.Search), escapedSearch(q.Search)}
	order, comparison := "DESC", "<"
	if q.Sort == "asc" {
		order, comparison = "ASC", ">"
	}
	if q.Cursor != "" {
		query += " AND rowid " + comparison + " ?"
		args = append(args, cursor.RowID)
	}
	query += " ORDER BY rowid " + order + " LIMIT ?"
	args = append(args, q.PageSize+1)
	if q.Cursor == "" && q.Page > 1 {
		query += " OFFSET ?"
		args = append(args, (q.Page-1)*q.PageSize)
	}
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return result, queryError(ctx)
	}
	defer rows.Close()
	scanned, lastRow := 0, int64(0)
	seen := map[LoginItem]bool{}
	for rows.Next() {
		var origin, username sql.NullString
		var rowID int64
		if err := rows.Scan(&origin, &username, &rowID); err != nil {
			return result, queryError(ctx)
		}
		if scanned == q.PageSize {
			result.HasMore = true
			break
		}
		scanned++
		lastRow = rowID
		if !origin.Valid || len(origin.String) > 8192 || len(username.String) > 512 || !utf8.ValidString(username.String) {
			continue
		}
		parsed, e := url.Parse(origin.String)
		if e != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") || parsed.User != nil || parsed.Opaque != "" {
			continue
		}
		domain := strings.ToLower(parsed.Hostname())
		if !inventoryDomain(domain) {
			continue
		}
		item := LoginItem{Domain: domain, Username: username.String, CredentialExists: true}
		if !seen[item] {
			seen[item] = true
			result.Items = append(result.Items, item)
		}
	}
	if rows.Err() != nil {
		return result, queryError(ctx)
	}
	current, err := sourceFingerprint(file)
	if err != nil || current != stamp {
		return InventoryPage{Items: []LoginItem{}}, errors.New("Manba yangilandi; birinchi sahifadan qayta boshlang")
	}
	if result.HasMore {
		result.NextCursor, err = encodeCursor(queryCursor{Fingerprint: stamp, Binding: binding, RowID: lastRow, Expires: time.Now().Add(5 * time.Minute).Unix()})
	}
	return result, err
}
