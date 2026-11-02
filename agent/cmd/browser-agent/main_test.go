package main

import (
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
	if runtime.GOOS != "linux" {
		t.Skip("Linux profil katalogi sinovi")
	}
	home := t.TempDir()
	root := filepath.Join(home, ".config/google-chrome/Default")
	if e := os.MkdirAll(root, 0700); e != nil {
		t.Fatal(e)
	}
	file := filepath.Join(root, "History")
	if e := os.WriteFile(file, []byte{}, 0600); e != nil {
		t.Fatal(e)
	}
	t.Setenv("BROWSER_AGENT_PROFILE_HOME", home)
	browsers := browser.Discover(home, "linux")
	if len(browsers) == 0 || len(browsers[0].Profiles) == 0 {
		t.Skip("Linux standart katalogi sinovi")
	}
	params, _ := json.Marshal(browser.Query{BrowserID: "chrome", ProfileID: browsers[0].Profiles[0].ID, Page: 1, PageSize: 50})
	c := cache.New(4096, time.Minute)
	c.Set(string(params), []byte(`{"items":[{"title":"Cached"}]}`))
	m := protocol.Message{Type: "HISTORY_QUERY", Params: params}
	if _, e := handle(m, c); e != nil {
		t.Fatal(e)
	}
	if e := os.Remove(file); e != nil {
		t.Fatal(e)
	}
	if _, e := handle(m, c); e == nil {
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
