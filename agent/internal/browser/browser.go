package browser

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	_ "github.com/mattn/go-sqlite3"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
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
	Items      []Visit `json:"items"`
	Page       int     `json:"page"`
	PageSize   int     `json:"page_size"`
	NextCursor *string `json:"next_cursor"`
	HasMore    bool    `json:"has_more"`
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
	Cursor    string `json:"cursor"`
	Stream    bool   `json:"stream"`
}

func id(path string) string { h := sha256.Sum256([]byte(path)); return hex.EncodeToString(h[:12]) }
func Discover(home, platform string, includeProfiles ...bool) []Browser {
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
		if len(includeProfiles) > 0 && !includeProfiles[0] {
			out = append(out, b)
			continue
		}
		var profileNames map[string]chromiumProfileInfo
		if key == "chrome" || key == "edge" || key == "brave" {
			profileNames = chromiumProfileNames(root)
		}
		if key == "safari" {
			if _, err := os.Stat(filepath.Join(root, "History.db")); err == nil {
				b.Profiles = append(b.Profiles, Profile{id(root), "Asosiy", root})
			}
		}
		for _, e := range entries {
			if len(b.Profiles) >= 1000 {
				break
			}
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
			label := e.Name()
			if key == "chrome" || key == "edge" || key == "brave" {
				metadata := chromiumProfileMetadata(p, profileNames[e.Name()])
				label = profileDisplayName(e.Name(), metadata)
			}
			b.Profiles = append(b.Profiles, Profile{id(p), label, p})
		}
		out = append(out, b)
	}
	return out
}
func Current(includeProfiles ...bool) ([]Browser, error) {
	h, e := os.UserHomeDir()
	if explicit := os.Getenv("BROWSER_AGENT_PROFILE_HOME"); explicit != "" {
		h = explicit
		e = nil
	}
	if e != nil {
		return nil, e
	}
	return Discover(h, runtime.GOOS, includeProfiles...), nil
}
func History(browsers []Browser, q Query) (Page, error) {
	if q.Page < 1 || q.Page > 100000 || q.PageSize < 1 || q.PageSize > 200 {
		return Page{Items: []Visit{}, Page: q.Page, PageSize: q.PageSize}, errors.New("Sahifa chegarasi notoʻgʻri")
	}
	return HistoryContext(context.Background(), browsers, q)
}

func historyURI(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	// SQLite file URIs use slash separators and /C:/... for Windows drives.
	// Without the leading slash net/url encodes a drive path as an opaque URI.
	uriPath := filepath.ToSlash(absolute)
	if !strings.HasPrefix(uriPath, "/") {
		uriPath = "/" + uriPath
	}
	uri := url.URL{Scheme: "file", Path: uriPath}
	params := url.Values{"mode": {"ro"}, "_query_only": {"1"}, "_busy_timeout": {"1000"}, "nolock": {"1"}}
	uri.RawQuery = params.Encode()
	return uri.String(), nil
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
