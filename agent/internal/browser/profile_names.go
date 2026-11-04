package browser

import (
	"encoding/json"
	"io"
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
}

func chromiumProfileNames(root string) map[string]chromiumProfileInfo {
	path := filepath.Join(root, "Local State")
	if !within(root, path) {
		return nil
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 || info.Size() > maxProfileMetadata {
		return nil
	}
	file, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer file.Close()
	info, err = file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxProfileMetadata {
		return nil
	}
	var state struct {
		Profile struct {
			InfoCache map[string]chromiumProfileInfo `json:"info_cache"`
		} `json:"profile"`
	}
	decoder := json.NewDecoder(io.LimitReader(file, maxProfileMetadata+1))
	if err := decoder.Decode(&state); err != nil {
		return nil
	}
	// Reject trailing JSON instead of trusting a partly valid metadata file.
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		return nil
	}
	return state.Profile.InfoCache
}

func profileDisplayName(directory string, info chromiumProfileInfo) string {
	name := cleanProfileLabel(info.Name)
	gaia := cleanProfileLabel(info.GaiaName)
	account := cleanProfileLabel(info.UserName)
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
