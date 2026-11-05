package browser

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func largeSources(root string, historyCount, loginCount int) ([]Browser, error) {
	profile := filepath.Join(root, "Default")
	if err := os.MkdirAll(profile, 0700); err != nil {
		return nil, err
	}
	for _, category := range []string{"history", "inventory"} {
		name, schema, count := "History", `CREATE TABLE urls(id INTEGER PRIMARY KEY,url TEXT,title TEXT,last_visit_time INTEGER,visit_count INTEGER); CREATE INDEX fixture_history_time ON urls(last_visit_time);`, historyCount
		if category == "inventory" {
			name, schema, count = "Login Data", `CREATE TABLE logins(origin_url TEXT,username_value TEXT,blacklisted_by_user INTEGER,password_value BLOB);`, loginCount
		}
		db, err := sql.Open("sqlite3", filepath.Join(profile, name))
		if err != nil {
			return nil, err
		}
		if _, err = db.Exec(schema); err != nil {
			db.Close()
			return nil, err
		}
		tx, err := db.Begin()
		if err != nil {
			db.Close()
			return nil, err
		}
		statement := `INSERT INTO urls VALUES(?,?,?,?,?)`
		if category == "inventory" {
			statement = `INSERT INTO logins VALUES(?,?,0,?)`
		}
		insert, err := tx.Prepare(statement)
		if err != nil {
			tx.Rollback()
			db.Close()
			return nil, err
		}
		for i := 0; i < count; i++ {
			if category == "history" {
				title := fmt.Sprintf("Sample %06d", i)
				if i%997 == 0 {
					title = "needle " + title
				}
				_, err = insert.Exec(i+1, fmt.Sprintf("https://synthetic.example.test/history/%d", i), title, int64(13348540800000000+i/5), 1)
			} else {
				_, err = insert.Exec(fmt.Sprintf("https://site-%05d.example.test/private?token=not-returned", i), fmt.Sprintf("user-%05d", i), []byte("NEVER_RETURN_SECRET"))
			}
			if err != nil {
				break
			}
		}
		insert.Close()
		if err != nil {
			tx.Rollback()
			db.Close()
			return nil, err
		}
		if err = tx.Commit(); err != nil {
			db.Close()
			return nil, err
		}
		if err = db.Close(); err != nil {
			return nil, err
		}
	}
	return []Browser{{ID: "chrome", Name: "Synthetic Chrome", Profiles: []Profile{{ID: "large", Name: "Synthetic", Path: profile}}}}, nil
}

func TestLargeCursorPaginationFiltersAndSourceInvalidation(t *testing.T) {
	browsers, err := largeSources(t.TempDir(), 100000, 10000)
	if err != nil {
		t.Fatal(err)
	}
	for _, order := range []string{"asc", "desc"} {
		q := Query{BrowserID: "chrome", ProfileID: "large", PageSize: 100, Sort: order, Stream: true}
		seen := map[string]bool{}
		for page := 0; page < 4; page++ {
			result, err := HistoryContext(context.Background(), browsers, q)
			if err != nil || len(result.Items) != 100 || !result.HasMore || result.NextCursor == nil {
				t.Fatalf("history cursor page %d: %d %v", page, len(result.Items), err)
			}
			for _, item := range result.Items {
				if seen[item.URL] {
					t.Fatal("duplicate history at timestamp boundary")
				}
				seen[item.URL] = true
			}
			if strings.Contains(*result.NextCursor, "synthetic") || len(*result.NextCursor) > 2048 {
				t.Fatal("cursor exposed source records or is unbounded")
			}
			q.Cursor = *result.NextCursor
		}
		changed := q
		changed.Search = "needle"
		if _, err := HistoryContext(context.Background(), browsers, changed); err == nil {
			t.Fatal("cursor reused with changed filter")
		}
		changed = q
		changed.Cursor = changed.Cursor[:len(changed.Cursor)-1] + "!"
		if _, err := HistoryContext(context.Background(), browsers, changed); err == nil {
			t.Fatal("tampered cursor accepted")
		}
	}
	q := Query{BrowserID: "chrome", ProfileID: "large", PageSize: 50, Search: "needle", Stream: true}
	history, err := HistoryContext(context.Background(), browsers, q)
	if err != nil || len(history.Items) != 50 {
		t.Fatalf("source-side search: %d %v", len(history.Items), err)
	}
	for _, item := range history.Items {
		if !strings.Contains(item.Title, "needle") {
			t.Fatal("unfiltered source result")
		}
	}
	inventoryQuery := Query{BrowserID: "chrome", ProfileID: "large", PageSize: 100, Sort: "asc", Stream: true}
	inventorySeen := map[string]bool{}
	for page := 0; page < 100; page++ {
		inventory, err := InventoryQueryContext(context.Background(), browsers, inventoryQuery)
		if err != nil || len(inventory.Items) != 100 {
			t.Fatalf("login metadata page %d: %d %v", page, len(inventory.Items), err)
		}
		raw, _ := json.Marshal(inventory)
		for _, secret := range []string{"NEVER_RETURN_SECRET", "not-returned", "/private", "password_value"} {
			if strings.Contains(string(raw), secret) {
				t.Fatal("private field in login page")
			}
		}
		for _, item := range inventory.Items {
			if inventorySeen[item.Username] {
				t.Fatal("duplicate inventory cursor row")
			}
			inventorySeen[item.Username] = true
		}
		if page == 99 {
			if inventory.HasMore || inventory.NextCursor != nil {
				t.Fatal("unexpected cursor beyond last row")
			}
		} else {
			if inventory.NextCursor == nil || !inventory.HasMore {
				t.Fatal("missing login continuation")
			}
			inventoryQuery.Cursor = *inventory.NextCursor
		}
	}
	if len(inventorySeen) != 10000 {
		t.Fatal("login rows lost")
	}
	fingerprint := QueryFingerprint(browsers, q, "history")
	if fingerprint == "" {
		t.Fatal("missing fingerprint")
	}
	file := filepath.Join(browsers[0].Profiles[0].Path, "History")
	db, _ := sql.Open("sqlite3", file)
	if _, err := db.Exec(`INSERT INTO urls VALUES(100001,'https://new.example.test','needle new',13348540999999999,1)`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	if QueryFingerprint(browsers, q, "history") == fingerprint {
		t.Fatal("source update did not invalidate cache key")
	}
	q.Cursor = *history.NextCursor
	if _, err := HistoryContext(context.Background(), browsers, q); err == nil {
		t.Fatal("stale source cursor accepted")
	}
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	if QueryFingerprint(browsers, q, "history") != "" {
		t.Fatal("removed source still has usable fingerprint")
	}
}

func TestQueryCancellationPageSizesAndCursorScope(t *testing.T) {
	_, browsers := fixture(t, "chrome")
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := HistoryContext(ctx, browsers, Query{BrowserID: "chrome", ProfileID: browsers[0].Profiles[0].ID})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("cancelled query error: %v", err)
	}
	for _, size := range []int{20, 50, 100} {
		page, err := HistoryContext(context.Background(), browsers, Query{BrowserID: "chrome", ProfileID: browsers[0].Profiles[0].ID, PageSize: size, Stream: true})
		if err != nil || page.PageSize != size {
			t.Fatal("supported page size rejected")
		}
	}
	for _, size := range []int{19, 25, 101, 200} {
		if _, err := HistoryContext(context.Background(), browsers, Query{BrowserID: "chrome", ProfileID: browsers[0].Profiles[0].ID, PageSize: size, Stream: true}); err == nil {
			t.Fatal("unsupported new page size accepted")
		}
	}
	profile := browsers[0].Profiles[0]
	q := Query{BrowserID: "chrome", ProfileID: profile.ID, PageSize: 1}
	page, err := HistoryContext(context.Background(), browsers, q)
	if err != nil || page.NextCursor == nil {
		t.Fatal(err)
	}
	// A valid cursor cannot be applied to another discovered profile.
	browsers[0].Profiles = append(browsers[0].Profiles, Profile{ID: "different", Name: "Other", Path: profile.Path})
	q.ProfileID = "different"
	q.PageSize = 20
	q.Cursor = *page.NextCursor
	if _, err := HistoryContext(context.Background(), browsers, q); err == nil {
		t.Fatal("cursor crossed profile boundary")
	}
}

func TestFingerprintTracksWALAndMetadataSearch(t *testing.T) {
	browsers, file := inventoryFixture(t)
	insertLogin(t, file, "https://first.example.test", "match-user", 0)
	insertLogin(t, file, "https://other.example.test", "other-user", 0)
	q := Query{BrowserID: "chrome", ProfileID: browsers[0].Profiles[0].ID, Search: "match-user", PageSize: 20, Stream: true}
	page, err := InventoryQueryContext(context.Background(), browsers, q)
	if err != nil || len(page.Items) != 1 || page.Items[0].Username != "match-user" {
		t.Fatalf("login search: %+v %v", page, err)
	}
	before := QueryFingerprint(browsers, q, "inventory")
	if err := os.WriteFile(file+"-wal", []byte("synthetic-wal-fingerprint"), 0600); err != nil {
		t.Fatal(err)
	}
	if after := QueryFingerprint(browsers, q, "inventory"); before == after || after == "" {
		t.Fatal("WAL change did not invalidate fingerprint")
	}
	ctx, cancel := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer cancel()
	if _, err := InventoryQueryContext(ctx, browsers, q); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("inventory deadline not propagated: %v", err)
	}
}
