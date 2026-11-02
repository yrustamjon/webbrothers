package browser

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	_ "github.com/mattn/go-sqlite3"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Profile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Path string `json:"-"`
}
type Browser struct {
	ID       string    `json:"id"`
	Name     string    `json:"name"`
	Profiles []Profile `json:"profiles"`
}
type Visit struct {
	URL        string `json:"url"`
	Title      string `json:"title"`
	VisitedAt  string `json:"visited_at"`
	Domain     string `json:"domain"`
	VisitCount int64  `json:"visit_count"`
}
type Page struct {
	Items    []Visit `json:"items"`
	Page     int     `json:"page"`
	PageSize int     `json:"page_size"`
}
type Query struct {
	BrowserID string `json:"browser_id"`
	ProfileID string `json:"profile_id"`
	Search    string `json:"search"`
	Page      int    `json:"page"`
	PageSize  int    `json:"page_size"`
	Start     string `json:"start"`
	End       string `json:"end"`
	Sort      string `json:"sort"`
}

func id(path string) string { h := sha256.Sum256([]byte(path)); return hex.EncodeToString(h[:12]) }
func Discover(home, platform string) []Browser {
	roots := map[string]string{}
	names := map[string]string{"chrome": "Google Chrome", "edge": "Microsoft Edge", "brave": "Brave", "firefox": "Mozilla Firefox", "safari": "Safari"}
	switch platform {
	case "linux":
		roots = map[string]string{"chrome": ".config/google-chrome", "edge": ".config/microsoft-edge", "brave": ".config/BraveSoftware/Brave-Browser", "firefox": ".mozilla/firefox"}
	case "darwin":
		roots = map[string]string{"chrome": "Library/Application Support/Google/Chrome", "edge": "Library/Application Support/Microsoft Edge", "brave": "Library/Application Support/BraveSoftware/Brave-Browser", "firefox": "Library/Application Support/Firefox/Profiles", "safari": "Library/Safari"}
	case "windows":
		roots = map[string]string{"chrome": "AppData/Local/Google/Chrome/User Data", "edge": "AppData/Local/Microsoft/Edge/User Data", "brave": "AppData/Local/BraveSoftware/Brave-Browser/User Data", "firefox": "AppData/Roaming/Mozilla/Firefox/Profiles"}
	}
	homeReal, err := filepath.EvalSymlinks(home)
	if err != nil {
		return []Browser{}
	}
	out := []Browser{}
	for _, key := range []string{"chrome", "edge", "brave", "firefox", "safari"} {
		rel, ok := roots[key]
		if !ok {
			continue
		}
		root := filepath.Join(home, filepath.FromSlash(rel))
		if !within(homeReal, root) {
			continue
		}
		entries, err := os.ReadDir(root)
		if err != nil {
			continue
		}
		b := Browser{ID: key, Name: names[key], Profiles: []Profile{}}
		if key == "safari" {
			if _, err := os.Stat(filepath.Join(root, "History.db")); err == nil {
				b.Profiles = append(b.Profiles, Profile{id(root), "Asosiy", root})
			}
		}
		for _, e := range entries {
			if !e.IsDir() || e.Type()&os.ModeSymlink != 0 {
				continue
			}
			p := filepath.Join(root, e.Name())
			if !within(homeReal, p) {
				continue
			}
			db := "History"
			if key == "firefox" {
				db = "places.sqlite"
			}
			if !within(homeReal, filepath.Join(p, db)) {
				continue
			}
			if _, err := os.Stat(filepath.Join(p, db)); err != nil {
				continue
			}
			b.Profiles = append(b.Profiles, Profile{id(p), e.Name(), p})
		}
		out = append(out, b)
	}
	return out
}
func Current() ([]Browser, error) {
	h, e := os.UserHomeDir()
	if explicit := os.Getenv("BROWSER_AGENT_PROFILE_HOME"); explicit != "" {
		h = explicit
		e = nil
	}
	if e != nil {
		return nil, e
	}
	return Discover(h, runtime.GOOS), nil
}
func History(browsers []Browser, q Query) (Page, error) {
	result := Page{Items: []Visit{}, Page: q.Page, PageSize: q.PageSize}
	if q.Page < 1 || q.Page > 100000 || q.PageSize < 1 || q.PageSize > 200 {
		return result, errors.New("Sahifa chegarasi notoʻgʻri")
	}
	var path string
	for _, b := range browsers {
		if b.ID == q.BrowserID {
			for _, p := range b.Profiles {
				if p.ID == q.ProfileID {
					path = p.Path
				}
			}
		}
	}
	if path == "" {
		return result, errors.New("Profil topilmadi yoki ruxsat yoʻq")
	}
	if q.BrowserID == "safari" {
		return result, errors.New("Safari tarixi hozircha qoʻllab-quvvatlanmaydi")
	}
	file := "History"
	query := `SELECT substr(url,1,8192),substr(title,1,2048),last_visit_time,visit_count FROM urls WHERE (url LIKE ? ESCAPE '\' OR title LIKE ? ESCAPE '\')`
	epoch := int64(11644473600000000)
	if q.BrowserID == "firefox" {
		file = "places.sqlite"
		epoch = 0
		query = `SELECT substr(url,1,8192),substr(COALESCE(title,''),1,2048),last_visit_date,visit_count FROM moz_places WHERE (url LIKE ? ESCAPE '\' OR title LIKE ? ESCAPE '\')`
	}
	if !within(path, filepath.Join(path, file)) {
		return result, errors.New("Profil yoʻli ruxsat doirasidan tashqarida")
	}
	uri := url.URL{Scheme: "file", Path: filepath.Join(path, file)}
	db, err := sql.Open("sqlite3", uri.String()+"?mode=ro&_query_only=1&_busy_timeout=1000")
	if err != nil {
		return result, errors.New("Tarix bazasi ochilmadi")
	}
	defer db.Close()
	db.SetMaxOpenConns(1)
	args := []any{}
	search := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(q.Search)
	args = append(args, "%"+search+"%", "%"+search+"%")
	column := "last_visit_time"
	if q.BrowserID == "firefox" {
		column = "last_visit_date"
	}
	for _, f := range []struct{ v, op string }{{q.Start, ">="}, {q.End, "<="}} {
		if f.v != "" {
			t, e := time.Parse(time.RFC3339, f.v)
			if e != nil {
				return result, errors.New("Sana formati notoʻgʻri")
			}
			query += " AND " + column + f.op + "?"
			args = append(args, t.UnixMicro()+epoch)
		}
	}
	order := "DESC"
	if q.Sort == "asc" {
		order = "ASC"
	} else if q.Sort != "" && q.Sort != "desc" {
		return result, errors.New("Saralash notoʻgʻri")
	}
	query += " ORDER BY " + column + " " + order + " LIMIT ? OFFSET ?"
	args = append(args, q.PageSize, (q.Page-1)*q.PageSize)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	rows, e := db.QueryContext(ctx, query, args...)
	if e != nil {
		return result, errors.New("Brauzer bazasi band yoki sxemasi qoʻllanmaydi")
	}
	defer rows.Close()
	for rows.Next() {
		var v Visit
		var micro sql.NullInt64
		if e = rows.Scan(&v.URL, &v.Title, &micro, &v.VisitCount); e != nil {
			return result, fmt.Errorf("Tarix yozuvi oʻqilmadi")
		}
		if micro.Valid {
			v.VisitedAt = time.UnixMicro(micro.Int64 - epoch).UTC().Format(time.RFC3339)
		}
		u, _ := url.Parse(v.URL)
		if u != nil {
			v.Domain = u.Hostname()
		}
		result.Items = append(result.Items, v)
	}
	return result, rows.Err()
}

func within(root, path string) bool {
	r, e := filepath.EvalSymlinks(root)
	if e != nil {
		return false
	}
	p, e := filepath.EvalSymlinks(path)
	if e != nil {
		return false
	}
	rel, e := filepath.Rel(r, p)
	return e == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}
