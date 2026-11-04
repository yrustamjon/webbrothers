//go:build windows && !cgo

package traffic

import "errors"

func Collect() (Stats, error) {
	return Stats{}, errors.New("Windows trafik yigʻuvchisi CGO bilan yigʻilgan agentni talab qiladi")
}
