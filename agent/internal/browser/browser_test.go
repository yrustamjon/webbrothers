package browser

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func fixture(t *testing.T, kind string) (string, []Browser) {
	t.Helper()
	h := t.TempDir()
	rel := ".config/google-chrome/Default"
	file := "History"
	schema := `CREATE TABLE urls (url TEXT,title TEXT,last_visit_time INTEGER,visit_count INTEGER); INSERT INTO urls VALUES ('https://example.test/path?private=yes','Sinov',13348540800000000,3),('https://other.test','Boshqa',13348540801000000,1)`
	if kind == "firefox" {
		rel = ".mozilla/firefox/a.default"
		file = "places.sqlite"
		schema = `CREATE TABLE moz_places(url TEXT,title TEXT,last_visit_date INTEGER,visit_count INTEGER);INSERT INTO moz_places VALUES ('https://example.test','Firefox',1704067200000000,2)`
	}
	p := filepath.Join(h, rel)
	if e := os.MkdirAll(p, 0700); e != nil {
		t.Fatal(e)
	}
	db, e := sql.Open("sqlite3", filepath.Join(p, file))
	if e != nil {
		t.Fatal(e)
	}
	if _, e = db.Exec(schema); e != nil {
		t.Fatal(e)
	}
	db.Close()
	b := Discover(h, "linux")
	if len(b) != 1 || len(b[0].Profiles) != 1 {
		t.Fatalf("discovery %+v", b)
	}
	return h, b
}
func TestHistoryReadOnlyAndFilters(t *testing.T) {
	h, b := fixture(t, "chrome")
	p := filepath.Join(h, ".config/google-chrome/Default/History")
	before, _ := os.ReadFile(p)
	q := Query{BrowserID: "chrome", ProfileID: b[0].Profiles[0].ID, Page: 1, PageSize: 1, Search: "example", Start: "2023-01-01T00:00:00Z", End: "2025-01-01T00:00:00Z"}
	r, e := History(b, q)
	if e != nil || len(r.Items) != 1 || r.Items[0].Domain != "example.test" {
		t.Fatalf("%+v %v", r, e)
	}
	if _, e = time.Parse(time.RFC3339, r.Items[0].VisitedAt); e != nil {
		t.Fatal(e)
	}
	after, _ := os.ReadFile(p)
	if string(before) != string(after) {
		t.Fatal("source database mutated")
	}
	q.Search = "%"
	r, e = History(b, q)
	if e != nil || len(r.Items) != 0 {
		t.Fatalf("LIKE wildcard not escaped %+v %v", r, e)
	}
	q.ProfileID = "../../etc"
	if _, e = History(b, q); e == nil {
		t.Fatal("unknown profile allowed")
	}
	q.PageSize = 201
	if _, e = History(b, q); e == nil {
		t.Fatal("unbounded page")
	}
}
func TestFirefoxTimestamp(t *testing.T) {
	_, b := fixture(t, "firefox")
	r, e := History(b, Query{BrowserID: "firefox", ProfileID: b[0].Profiles[0].ID, Page: 1, PageSize: 50})
	if e != nil || len(r.Items) != 1 || r.Items[0].VisitedAt != "2024-01-01T00:00:00Z" {
		t.Fatalf("%+v %v", r, e)
	}
}
func TestDiscoveryRejectsEscapedSymlinks(t *testing.T) {
	external, b := fixture(t, "chrome")
	_ = b
	h := t.TempDir()
	if e := os.MkdirAll(filepath.Join(h, ".config"), 0700); e != nil {
		t.Fatal(e)
	}
	if e := os.Symlink(filepath.Join(external, ".config/google-chrome"), filepath.Join(h, ".config/google-chrome")); e != nil {
		t.Skip(e)
	}
	if got := Discover(h, "linux"); len(got) != 0 {
		t.Fatal("escaped browser root allowed")
	}
}
func TestUnsupportedAndMissing(t *testing.T) {
	if b := Discover(t.TempDir(), "unknown"); len(b) != 0 {
		t.Fatal(b)
	}
	_, b := fixture(t, "chrome")
	b[0].ID = "safari"
	if _, e := History(b, Query{BrowserID: "safari", ProfileID: b[0].Profiles[0].ID, Page: 1, PageSize: 10}); e == nil {
		t.Fatal("fake Safari data")
	}
}
