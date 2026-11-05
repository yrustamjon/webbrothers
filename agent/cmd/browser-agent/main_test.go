package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"
	"webbrothers/agent/internal/browser"
	"webbrothers/agent/internal/cache"
	"webbrothers/agent/internal/protocol"
)

func TestHandlerDoesNotReturnCachedRemovedProfile(t *testing.T) {
	home := t.TempDir()
	relative := ".config/google-chrome/Default"
	if runtime.GOOS == "darwin" {
		relative = "Library/Application Support/Google/Chrome/Default"
	}
	if runtime.GOOS == "windows" {
		relative = "AppData/Local/Google/Chrome/User Data/Default"
	}
	root := filepath.Join(home, relative)
	if e := os.MkdirAll(root, 0700); e != nil {
		t.Fatal(e)
	}
	file := filepath.Join(root, "History")
	db, err := sql.Open("sqlite3", file)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`CREATE TABLE urls(id INTEGER PRIMARY KEY,url TEXT,title TEXT,visit_count INTEGER,last_visit_time INTEGER); INSERT INTO urls VALUES(1,'https://synthetic.example.test','Cached',1,13300000000000000)`)
	db.Close()
	if err != nil {
		t.Fatal(err)
	}
	t.Setenv("BROWSER_AGENT_PROFILE_HOME", home)
	browsers := browser.Discover(home, runtime.GOOS)
	if len(browsers) == 0 || len(browsers[0].Profiles) == 0 {
		t.Fatal("Sintetik profil aniqlanmadi")
	}
	params, _ := json.Marshal(browser.Query{BrowserID: "chrome", ProfileID: browsers[0].Profiles[0].ID, Page: 1, PageSize: 50})
	c := cache.New(4096, time.Minute)
	engine := newQueryEngine(c)
	defer engine.clear()
	m := protocol.Message{Type: "HISTORY_QUERY", Params: params}
	if _, e := engine.handle(context.Background(), m); e != nil {
		t.Fatal(e)
	}
	if e := os.Remove(file); e != nil {
		t.Fatal(e)
	}
	if _, e := engine.handle(context.Background(), m); e == nil {
		t.Fatal("removed profile returned cached sensitive data")
	}
}
func TestHandlerRejectsUnknownEmptyQueryParams(t *testing.T) {
	t.Setenv("BROWSER_AGENT_PROFILE_HOME", t.TempDir())
	for _, kind := range []string{"BROWSER_LIST_REQUEST", "TRAFFIC_STATS_REQUEST"} {
		for _, raw := range []string{`null`, `{"command":"whoami"}`, `{} {}`, `{"x":1,"x":2}`} {
			if _, e := handle(protocol.Message{Type: kind, Params: json.RawMessage(raw)}, cache.New(4096, time.Minute)); e == nil {
				t.Fatalf("invalid %s params accepted", kind)
			}
		}
	}
}
