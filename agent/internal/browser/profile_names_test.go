package browser

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func chromiumMetadataFixture(t *testing.T) (string, string) {
	t.Helper()
	home := t.TempDir()
	root := filepath.Join(home, ".config", "google-chrome")
	for _, name := range []string{"Default", "Profile 1", "Profile 50"} {
		profile := filepath.Join(root, name)
		if err := os.MkdirAll(profile, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(profile, "History"), nil, 0600); err != nil {
			t.Fatal(err)
		}
	}
	return home, root
}

func TestChromiumDiscoveryUsesProfileNamesAndAccounts(t *testing.T) {
	home, root := chromiumMetadataFixture(t)
	state := `{"profile":{"info_cache":{"Default":{"name":"Shaxsiy","user_name":"personal@example.test"},"Profile 1":{"name":"Ish — Oʻzbek","user_name":"work@example.test"},"Profile 50":{"name":"Profile 50","gaia_name":"Haqiqiy ism","user_name":"account@example.test"},"Profile 999":{"name":"Mavjud emas","user_name":"missing@example.test"}}},"os_crypt":{"encrypted_key":"ignored-sentinel"}}`
	if err := os.WriteFile(filepath.Join(root, "Local State"), []byte(state), 0600); err != nil {
		t.Fatal(err)
	}
	browsers := Discover(home, "linux")
	if len(browsers) != 1 || len(browsers[0].Profiles) != 3 {
		t.Fatalf("unexpected profiles: %+v", browsers)
	}
	want := []string{"Shaxsiy · personal@example.test", "Ish — Oʻzbek · work@example.test", "Haqiqiy ism · account@example.test"}
	for i, profile := range browsers[0].Profiles {
		if profile.Name != want[i] || profile.ID != id(profile.Path) {
			t.Fatalf("profile label/id: %+v", profile)
		}
	}
	encoded, err := json.Marshal(browsers)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "ignored-sentinel") || strings.Contains(string(encoded), root) || strings.Contains(string(encoded), "missing@example.test") {
		t.Fatal("unrelated metadata/path escaped discovery response")
	}
}

func TestChromiumMetadataFallback(t *testing.T) {
	for _, state := range []string{
		`{`,
		`{"profile":{"info_cache":{"Profile 1":{"name":"Ish"}}}} {}`,
		`{"profile":{"info_cache":{"Profile 999":{"name":"Notoʻgʻri profil"}}}}`,
		`{"profile":{"info_cache":null}}`,
	} {
		t.Run(state, func(t *testing.T) {
			home, root := chromiumMetadataFixture(t)
			if err := os.WriteFile(filepath.Join(root, "Local State"), []byte(state), 0600); err != nil {
				t.Fatal(err)
			}
			for _, profile := range Discover(home, "linux")[0].Profiles {
				if profile.Name != filepath.Base(profile.Path) {
					t.Fatalf("fallback label: %+v", profile)
				}
			}
		})
	}
}

func TestChromiumMetadataMissingOversizedOrEscaped(t *testing.T) {
	home, root := chromiumMetadataFixture(t)
	if got := chromiumProfileNames(root); got != nil {
		t.Fatal("missing metadata should have no labels")
	}
	file := filepath.Join(root, "Local State")
	if err := os.WriteFile(file, []byte(strings.Repeat(" ", maxProfileMetadata+1)), 0600); err != nil {
		t.Fatal(err)
	}
	if got := chromiumProfileNames(root); got != nil {
		t.Fatal("oversized metadata accepted")
	}
	if err := os.Remove(file); err != nil {
		t.Fatal(err)
	}
	external := filepath.Join(t.TempDir(), "Local State")
	if err := os.WriteFile(external, []byte(`{"profile":{"info_cache":{"Default":{"name":"External"}}}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(external, file); err != nil {
		t.Skip(err)
	}
	if got := chromiumProfileNames(root); got != nil {
		t.Fatal("escaped metadata symlink accepted")
	}
	for _, profile := range Discover(home, "linux")[0].Profiles {
		if profile.Name != filepath.Base(profile.Path) {
			t.Fatal("external metadata applied to profile")
		}
	}
}

func TestProfileDisplayNameFallbackAndLimits(t *testing.T) {
	for _, test := range []struct {
		info chromiumProfileInfo
		want string
	}{
		{chromiumProfileInfo{}, "Profile 1"},
		{chromiumProfileInfo{GaiaName: "Ism"}, "Ism"},
		{chromiumProfileInfo{UserName: "person@example.test"}, "person@example.test"},
		{chromiumProfileInfo{Name: "person@example.test", UserName: "person@example.test"}, "person@example.test"},
		{chromiumProfileInfo{Name: "\x00 Ish\n Profili\t", UserName: "work@example.test"}, "Ish Profili · work@example.test"},
	} {
		if got := profileDisplayName("Profile 1", test.info); got != test.want {
			t.Fatalf("label %q, want %q", got, test.want)
		}
	}
	label := profileDisplayName("Profile 1", chromiumProfileInfo{Name: strings.Repeat("名", 800), UserName: "person@example.test"})
	if len([]rune(label)) != 512 {
		t.Fatal("profile label exceeds protocol limit")
	}
	if !strings.Contains(label, "person@example.test") {
		t.Fatal("long display name hid the real account email")
	}
}

func TestBrowserOnlyDiscoveryDoesNotExposeProfileEmails(t *testing.T) {
	home, root := chromiumMetadataFixture(t)
	if err := os.WriteFile(filepath.Join(root, "Local State"), []byte(`{"profile":{"info_cache":{"Default":{"name":"Private","user_name":"private@example.test"}}}}`), 0600); err != nil {
		t.Fatal(err)
	}
	browsers := Discover(home, "linux", false)
	if len(browsers) != 1 || len(browsers[0].Profiles) != 0 {
		t.Fatal("browser-only discovery included profiles")
	}
	encoded, err := json.Marshal(browsers)
	if err != nil || strings.Contains(string(encoded), "private@example.test") {
		t.Fatal("profile email escaped without profile discovery permission")
	}
}

func TestProfilePreferencesEmailFallbackDoesNotGuessAccounts(t *testing.T) {
	for _, test := range []struct {
		preferences string
		primaryID   string
		wantEmail   string
	}{
		{`{"account_info":[{"email":"primary@example.test","gaia":"one"}],"profile":{"name":"Work"}}`, "", "primary@example.test"},
		{`{"account_info":[{"email":"first@example.test","gaia":"one"},{"email":"second@example.test","gaia":"two"}]}`, "", ""},
		{`{"account_info":[{"email":"first@example.test","gaia":"one"},{"email":"second@example.test","gaia":"two"}]}`, "two", "second@example.test"},
		{`{"account_info":[{"email":"not-an-email"}]}`, "", ""},
		{`{"account_info":[{"email":"primary@example.test"}]} {}`, "", ""},
	} {
		t.Run(test.primaryID+test.wantEmail+test.preferences, func(t *testing.T) {
			profile := t.TempDir()
			if err := os.WriteFile(filepath.Join(profile, "Preferences"), []byte(test.preferences), 0600); err != nil {
				t.Fatal(err)
			}
			info := chromiumProfileMetadata(profile, chromiumProfileInfo{GaiaID: test.primaryID})
			if info.UserName != test.wantEmail {
				t.Fatalf("account metadata mismatch: got %q, want %q", info.UserName, test.wantEmail)
			}
		})
	}
}

func TestPreferencesFallbackIsUsedByDiscovery(t *testing.T) {
	home, root := chromiumMetadataFixture(t)
	if err := os.WriteFile(filepath.Join(root, "Profile 1", "Preferences"), []byte(`{"account_info":[{"email":"actual@example.test"}],"profile":{"name":"Work"},"unrelated_secret":"must-not-leave"}`), 0600); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(Discover(home, "linux"))
	if err != nil || !strings.Contains(string(encoded), "actual@example.test") || strings.Contains(string(encoded), "must-not-leave") {
		t.Fatal("discovery did not isolate account metadata")
	}
}
