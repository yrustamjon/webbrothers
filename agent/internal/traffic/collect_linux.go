//go:build linux

package traffic

import (
	"bufio"
	"os"
)

func Collect() (Stats, error) {
	f, err := os.Open("/proc/net/dev")
	if err != nil {
		return Stats{}, err
	}
	defer f.Close()
	return Parse(bufio.NewScanner(f))
}
