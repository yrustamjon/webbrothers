package browser

import (
	"encoding/json"
	"io"
	"net/mail"
	"os"
	"path/filepath"
	"strings"
	"unicode"
)

const maxProfileMetadata = 4 << 20

// Only display metadata is decoded. Chromium encryption keys, tokens and other
// Local State fields are ignored and never returned to callers.
type chromiumProfileInfo struct {
	Name     string `json:"name"`
	UserName string `json:"user_name"`
	GaiaName string `json:"gaia_name"`
	GaiaID   string `json:"gaia_id"`
}

func chromiumProfileNames(root string) map[string]chromiumProfileInfo {
	var state struct {
		Profile struct {
			InfoCache map[string]chromiumProfileInfo `json:"info_cache"`
		} `json:"profile"`
	}
	if !readProfileMetadata(root, filepath.Join(root, "Local State"), &state) {
		return nil
	}
	return state.Profile.InfoCache
}

func readProfileMetadata(root, path string, target any) bool {
	if !within(root, path) {
		return false
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() > maxProfileMetadata {
		return false
	}
	file, err := os.Open(path)
	if err != nil {
		return false
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxProfileMetadata {
		return false
	}
	decoder := json.NewDecoder(io.LimitReader(file, maxProfileMetadata+1))
	if err := decoder.Decode(target); err != nil {
		return false
	}
	// Reject trailing JSON instead of trusting a partly valid metadata file.
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return false
	}
	return true
}

func profileEmail(value string) string {
	value = strings.TrimSpace(value)
	if len(value) > 254 {
		return ""
	}
	address, err := mail.ParseAddress(value)
	if err != nil || address.Address != value || !strings.Contains(value, "@") {
		return ""
	}
	return value
}

// Preferences is only a fallback for explicit Chrome-account metadata. Never
// infer an account from history, cookies or saved logins; multiple accounts are
// ambiguous unless Local State identifies the primary Gaia ID.
func chromiumProfileMetadata(profile string, info chromiumProfileInfo) chromiumProfileInfo {
	if profileEmail(info.UserName) != "" {
		return info
	}
	var preferences struct {
		AccountInfo []struct {
			Email string `json:"email"`
			Gaia  string `json:"gaia"`
		} `json:"account_info"`
		Profile struct {
			Name string `json:"name"`
		} `json:"profile"`
	}
	if !readProfileMetadata(profile, filepath.Join(profile, "Preferences"), &preferences) {
		return info
	}
	if info.Name == "" || info.Name == filepath.Base(profile) {
		info.Name = preferences.Profile.Name
	}
	if len(preferences.AccountInfo) == 1 {
		info.UserName = profileEmail(preferences.AccountInfo[0].Email)
	} else if info.GaiaID != "" {
		for _, account := range preferences.AccountInfo {
			if account.Gaia == info.GaiaID {
				info.UserName = profileEmail(account.Email)
				break
			}
		}
	}
	return info
}

func profileDisplayName(directory string, info chromiumProfileInfo) string {
	name := cleanProfileLabel(info.Name)
	gaia := cleanProfileLabel(info.GaiaName)
	account := profileEmail(info.UserName)
	if name == "" || name == directory {
		name = gaia
	}
	if name == "" {
		name = account
	}
	if name == "" {
		return cleanProfileLabel(directory)
	}
	if account != "" && !strings.EqualFold(name, account) {
		available := 512 - len([]rune(account)) - 3
		if available <= 0 {
			return account
		}
		if len([]rune(name)) > available {
			name = string([]rune(name)[:available])
		}
		name += " · " + account
	}
	return cleanProfileLabel(name)
}

func cleanProfileLabel(value string) string {
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, value)
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) > 512 {
		return string(runes[:512])
	}
	return value
}
