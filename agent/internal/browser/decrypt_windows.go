//go:build windows

package browser

import (
	"crypto/aes"
	"crypto/cipher"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"unsafe"

	"golang.org/x/sys/windows"
)

type localState struct {
	OSCrypt struct {
		EncryptedKey string `json:"encrypted_key"`
	} `json:"os_crypt"`
}

func decryptPassword(profilePath string, encrypted []byte) (string, error) {
	// ... (oldingi kod o'zgarishsiz qoladi) ...

	// DPAPI orqali master key olish
	masterKey, err := dpapiDecrypt(dpapiBlob)
	if err != nil {
		return "", err
	}
	if len(masterKey) != 32 {
		return "", errors.New("Master key uzunligi notoʻgʻri")
	}

	// ... (qolgan qism o'zgarishsiz) ...
}

// dpapiDecrypt Windows CryptUnprotectData ni chaqiradi.
func dpapiDecrypt(blob []byte) ([]byte, error) {
	var out windows.DataBlob
	in := windows.DataBlob{
		Size: uint32(len(blob)),
		Data: &blob[0],
	}
	r, _, err := windows.NewLazySystemDLL("crypt32.dll").
		NewProc("CryptUnprotectData").
		Call(
			uintptr(unsafe.Pointer(&in)),
			0, 0, 0, 0, 0,
			uintptr(unsafe.Pointer(&out)),
		)
	if r == 0 {
		return nil, errors.New("DPAPI shifrini ochish muvaffaqiyatsiz: " + err.Error())
	}
	defer windows.LocalFree(windows.HLOCAL(uintptr(unsafe.Pointer(out.Data))))
	result := make([]byte, out.Size)
	copy(result, unsafe.Slice(out.Data, out.Size))
	return result, nil
}