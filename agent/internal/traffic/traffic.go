package traffic

import (
	"bufio"
	"errors"
	"os"
	"runtime"
	"strconv"
	"strings"
	"time"
)

type Stats struct {
	Received    uint64 `json:"received_bytes"`
	Sent        uint64 `json:"sent_bytes"`
	Attribution string `json:"attribution"`
	CollectedAt string `json:"collected_at"`
}

func Collect() (Stats, error) {
	if runtime.GOOS != "linux" {
		return Stats{}, errors.New("Bu OS uchun trafik yigʻish qoʻllab-quvvatlanmaydi")
	}
	f, e := os.Open("/proc/net/dev")
	if e != nil {
		return Stats{}, e
	}
	defer f.Close()
	return Parse(bufio.NewScanner(f))
}
func Parse(s *bufio.Scanner) (Stats, error) {
	r := Stats{Attribution: "device", CollectedAt: time.Now().UTC().Format(time.RFC3339)}
	for s.Scan() {
		p := strings.SplitN(s.Text(), ":", 2)
		if len(p) != 2 || strings.TrimSpace(p[0]) == "lo" {
			continue
		}
		v := strings.Fields(p[1])
		if len(v) < 16 {
			return r, errors.New("Trafik formati notoʻgʻri")
		}
		a, e := strconv.ParseUint(v[0], 10, 64)
		if e != nil {
			return r, e
		}
		b, e := strconv.ParseUint(v[8], 10, 64)
		if e != nil {
			return r, e
		}
		r.Received += a
		r.Sent += b
	}
	return r, s.Err()
}
