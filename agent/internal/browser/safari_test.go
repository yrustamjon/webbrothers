package browser

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"
)

func safariFixture(t *testing.T) (string, []Browser) {
	t.Helper()
	home := t.TempDir()
	profile := filepath.Join(home, "Library", "Safari")
	if err := os.MkdirAll(profile, 0700); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite3", filepath.Join(profile, "History.db"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE history_items(id INTEGER PRIMARY KEY,url TEXT,visit_count INTEGER);
		CREATE TABLE history_visits(id INTEGER PRIMARY KEY,history_item INTEGER,visit_time REAL,title TEXT);
		INSERT INTO history_items VALUES(1,'https://safari.example.test/a',2),(2,'https://other.example.test/100%_done',1);
		INSERT INTO history_visits VALUES(10,1,725760000.25,'Safari eski'),(11,1,725760001.5,'Safari yangi'),(12,2,725760002,NULL);`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	browsers := Discover(home, "darwin")
	if len(browsers) != 1 || browsers[0].ID != "safari" || len(browsers[0].Profiles) != 1 {
		t.Fatalf("Safari discovery: %+v", browsers)
	}
	return profile, browsers
}

func safariQuery(browsers []Browser) Query {
	return Query{BrowserID: "safari", ProfileID: browsers[0].Profiles[0].ID, Page: 1, PageSize: 50}
}

func TestSafariVisitJoinEpochAndReadOnly(t *testing.T) {
	profile, browsers := safariFixture(t)
	file := filepath.Join(profile, "History.db")
	before, err := os.ReadFile(file)
	if err != nil {
		t.Fatal(err)
	}
	page, err := History(browsers, safariQuery(browsers))
	if err != nil || len(page.Items) != 3 {
		t.Fatalf("Safari history: %+v, %v", page, err)
	}
	if page.Items[0].VisitedAt != "2024-01-01T00:00:02Z" || page.Items[0].Title != "" {
		t.Fatalf("NULL title or epoch: %+v", page.Items[0])
	}
	if page.Items[1].VisitedAt != "2024-01-01T00:00:01.5Z" || page.Items[2].VisitedAt != "2024-01-01T00:00:00.25Z" {
		t.Fatalf("fractional timestamp: %+v", page.Items)
	}
	if page.Items[1].URL != page.Items[2].URL || page.Items[1].VisitCount != 2 || page.Items[1].Domain != "safari.example.test" {
		t.Fatalf("repeated visits / URL count: %+v", page.Items)
	}
	after, err := os.ReadFile(file)
	if err != nil || string(after) != string(before) {
		t.Fatal("Safari source changed")
	}
	uri, err := historyURI(file)
	if err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite3", uri)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("DELETE FROM history_visits"); err == nil {
		t.Fatal("Safari connection allowed a write")
	}
}

func TestSafariFiltersAndPagination(t *testing.T) {
	_, browsers := safariFixture(t)
	q := safariQuery(browsers)
	q.Search, q.Sort, q.PageSize, q.Page = "Safari", "asc", 1, 2
	page, err := History(browsers, q)
	if err != nil || len(page.Items) != 1 || page.Items[0].Title != "Safari yangi" {
		t.Fatalf("filter/sort/page: %+v %v", page, err)
	}
	q.Page, q.PageSize, q.Search = 1, 50, ""
	q.Start, q.End = "2024-01-01T00:00:00.25Z", "2024-01-01T00:00:01.5Z"
	page, err = History(browsers, q)
	if err != nil || len(page.Items) != 2 {
		t.Fatalf("inclusive date range: %+v %v", page, err)
	}
	q.Start, q.End, q.Search = "", "", "%_"
	page, err = History(browsers, q)
	if err != nil || len(page.Items) != 1 || page.Items[0].URL != "https://other.example.test/100%_done" {
		t.Fatalf("escaped LIKE: %+v %v", page, err)
	}
	q.Search = "not-present"
	page, err = History(browsers, q)
	if err != nil || page.Items == nil || len(page.Items) != 0 {
		t.Fatalf("empty result: %+v %v", page, err)
	}
}

func TestSafariRejectsInvalidRequestsAndUnavailableDB(t *testing.T) {
	profile, browsers := safariFixture(t)
	for _, change := range []func(*Query){
		func(q *Query) { q.ProfileID = "../unknown" },
		func(q *Query) { q.PageSize = 201 },
		func(q *Query) { q.Page = 0 },
		func(q *Query) { q.Start = "bad-date" },
		func(q *Query) { q.Sort = "invalid" },
	} {
		q := safariQuery(browsers)
		change(&q)
		if _, err := History(browsers, q); err == nil {
			t.Fatal("invalid Safari request allowed")
		}
	}
	if err := os.WriteFile(filepath.Join(profile, "History.db"), []byte("not SQLite"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := History(browsers, safariQuery(browsers)); err == nil {
		t.Fatal("invalid Safari schema accepted")
	}
	if err := os.Remove(filepath.Join(profile, "History.db")); err != nil {
		t.Fatal(err)
	}
	if _, err := History(browsers, safariQuery(browsers)); err == nil {
		t.Fatal("missing Safari DB accepted")
	}
}

func TestSafariRejectsEscapedHistoryDB(t *testing.T) {
	profile, browsers := safariFixture(t)
	external, _ := safariFixture(t)
	file := filepath.Join(profile, "History.db")
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(filepath.Join(external, "History.db"), file); err != nil {
		t.Skip(err)
	}
	if _, err := History(browsers, safariQuery(browsers)); err == nil {
		t.Fatal("escaped Safari history DB allowed")
	}
}
