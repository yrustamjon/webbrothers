package browser

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func inventoryFixture(t *testing.T) ([]Browser, string) {
	t.Helper()
	_, browsers := fixture(t, "chrome")
	file := filepath.Join(browsers[0].Profiles[0].Path, "Login Data")
	db, err := sql.Open("sqlite3", file)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE logins(origin_url TEXT,username_value TEXT,blacklisted_by_user INTEGER,password_value BLOB);`); err != nil {
		t.Fatal(err)
	}
	return browsers, file
}

func insertLogin(t *testing.T, file, origin, username string, blocked int) {
	t.Helper()
	db, err := sql.Open("sqlite3", file)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec(`INSERT INTO logins VALUES(?,?,?,?)`, origin, username, blocked, []byte("DO_NOT_READ_PASSWORD_SENTINEL")); err != nil {
		t.Fatal(err)
	}
}

func TestInventoryMetadataOnlyReadOnly(t *testing.T) {
	for _, kind := range []string{"chrome", "edge", "brave"} {
		t.Run(kind, func(t *testing.T) {
			browsers, file := inventoryFixture(t)
			browsers[0].ID = kind
			insertLogin(t, file, "https://Example.test/private/path?secret=yes", "alice", 0)
			insertLogin(t, file, "https://example.test/other", "alice", 0)
			insertLogin(t, file, "http://other.test/", "", 0)
			insertLogin(t, file, "https://blocked.test/", "blocked", 1)
			before, err := os.ReadFile(file)
			if err != nil {
				t.Fatal(err)
			}
			page, err := Inventory(browsers, kind, browsers[0].Profiles[0].ID)
			if err != nil || len(page.Items) != 2 {
				t.Fatalf("%+v %v", page, err)
			}
			if page.Items[0] != (LoginItem{Domain: "other.test", CredentialExists: true}) {
				t.Fatalf("unexpected item %+v", page.Items[0])
			}
			if page.Items[1] != (LoginItem{Domain: "example.test", Username: "alice", CredentialExists: true}) {
				t.Fatalf("unexpected item %+v", page.Items[1])
			}
			encoded, err := json.Marshal(page)
			if err != nil {
				t.Fatal(err)
			}
			for _, private := range []string{"DO_NOT_READ_PASSWORD_SENTINEL", "private/path", "secret=yes", "password_value", "blocked.test", file} {
				if bytes.Contains(encoded, []byte(private)) {
					t.Fatalf("private value in inventory: %q", private)
				}
			}
			after, err := os.ReadFile(file)
			if err != nil || !bytes.Equal(before, after) {
				t.Fatal("login database mutated")
			}
		})
	}
}

func TestInventoryFiltersInvalidOriginsAndBounds(t *testing.T) {
	browsers, file := inventoryFixture(t)
	for _, origin := range []string{"javascript:alert(1)", "file:///private/test", "android://hash@app", "https://user:secret@example.test/", "https:///missing", "https://%zz", "https://bad_host.test", "https://-bad.test", "https://" + strings.Repeat("a", 64) + ".test", "https://example.test/" + strings.Repeat("x", 8192)} {
		insertLogin(t, file, origin, "alice", 0)
	}
	insertLogin(t, file, "https://large.test/", strings.Repeat("a", 513), 0)
	insertLogin(t, file, "https://valid.test/", "alice", 0)
	page, err := Inventory(browsers, "chrome", browsers[0].Profiles[0].ID)
	if err != nil || len(page.Items) != 1 || page.Items[0].Domain != "valid.test" {
		t.Fatalf("%+v %v", page, err)
	}
	for i := 0; i < 220; i++ {
		insertLogin(t, file, fmt.Sprintf("https://valid-%03d.test/", i), "alice", 0)
	}
	page, err = Inventory(browsers, "chrome", browsers[0].Profiles[0].ID)
	if err != nil || len(page.Items) > 200 {
		t.Fatalf("unbounded result: %d %v", len(page.Items), err)
	}
}

func TestInventoryRejectsUnknownUnsupportedAndMissingProfiles(t *testing.T) {
	browsers, file := inventoryFixture(t)
	if _, err := Inventory(browsers, "chrome", "../../other"); err == nil {
		t.Fatal("unknown profile accepted")
	}
	if _, err := Inventory(browsers, "unknown", browsers[0].Profiles[0].ID); err == nil {
		t.Fatal("unknown browser accepted")
	}
	for _, kind := range []string{"firefox", "safari"} {
		browsers[0].ID = kind
		if _, err := Inventory(browsers, kind, browsers[0].Profiles[0].ID); err == nil {
			t.Fatal("unsupported browser accepted")
		}
	}
	browsers[0].ID = "chrome"
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	if _, err := Inventory(browsers, "chrome", browsers[0].Profiles[0].ID); err == nil {
		t.Fatal("missing database accepted")
	}
	if _, err := os.Stat(file); !os.IsNotExist(err) {
		t.Fatal("missing database created")
	}
}

func TestInventoryRejectsEscapedDatabase(t *testing.T) {
	browsers, file := inventoryFixture(t)
	external := filepath.Join(t.TempDir(), "Login Data")
	if err := os.Rename(file, external); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, file); err != nil {
		t.Skip(err)
	}
	if _, err := Inventory(browsers, "chrome", browsers[0].Profiles[0].ID); err == nil {
		t.Fatal("escaped database accepted")
	}
}

func TestInventoryDoesNotRequirePasswordColumn(t *testing.T) {
	browsers, file := inventoryFixture(t)
	db, err := sql.Open("sqlite3", file)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`DROP TABLE logins; CREATE TABLE logins(origin_url TEXT,username_value TEXT,blacklisted_by_user INTEGER); INSERT INTO logins VALUES('https://safe.test/','alice',0)`); err != nil {
		t.Fatal(err)
	}
	db.Close()
	page, err := Inventory(browsers, "chrome", browsers[0].Profiles[0].ID)
	if err != nil || len(page.Items) != 1 {
		t.Fatalf("metadata depended on password column: %+v %v", page, err)
	}
}
