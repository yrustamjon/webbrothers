//go:build !linux && !darwin && !windows

package traffic

import "errors"

func Collect() (Stats, error) {
	return Stats{}, errors.New("Bu OS uchun trafik yigʻish qoʻllab-quvvatlanmaydi")
}
