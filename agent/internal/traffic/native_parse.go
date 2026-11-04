package traffic

import (
	"bufio"
	"bytes"
	"errors"
	"math"
	"strconv"
	"strings"
	"time"
)

func totals() Stats {
	return Stats{Attribution: "device", CollectedAt: time.Now().UTC().Format(time.RFC3339)}
}

func addCounters(stats *Stats, received, sent uint64) error {
	if received > math.MaxUint64-stats.Received || sent > math.MaxUint64-stats.Sent {
		return errors.New("OS trafik hisoblagichi chegaradan oshdi")
	}
	stats.Received += received
	stats.Sent += sent
	return nil
}

func darwinLoopback(name string) bool {
	if !strings.HasPrefix(name, "lo") || len(name) <= 2 {
		return false
	}
	for _, c := range name[2:] {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

func parseDarwin(output []byte) (Stats, error) {
	scanner := bufio.NewScanner(bytes.NewReader(output))
	if !scanner.Scan() {
		return Stats{}, errors.New("OS trafik sarlavhasi topilmadi")
	}
	header := strings.Fields(scanner.Text())
	incoming, outgoing := -1, -1
	for index, value := range header {
		if value == "Ibytes" {
			incoming = len(header) - index
		}
		if value == "Obytes" {
			outgoing = len(header) - index
		}
	}
	if len(header) < 4 || header[0] != "Name" || header[2] != "Network" || incoming < 1 || outgoing < 1 {
		return Stats{}, errors.New("OS trafik formati notoʻgʻri")
	}
	stats := totals()
	seen := make(map[string]bool)
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 3 || !strings.HasPrefix(fields[2], "<Link#") {
			continue
		}
		name := strings.TrimSuffix(fields[0], "*")
		if darwinLoopback(name) {
			continue
		}
		if seen[name] || len(fields) < incoming+3 || len(fields) < outgoing+3 {
			return Stats{}, errors.New("OS interfeys hisoblagichi notoʻgʻri")
		}
		received, err := strconv.ParseUint(fields[len(fields)-incoming], 10, 64)
		if err != nil {
			return Stats{}, errors.New("OS kiruvchi bayt hisoblagichi notoʻgʻri")
		}
		sent, err := strconv.ParseUint(fields[len(fields)-outgoing], 10, 64)
		if err != nil {
			return Stats{}, errors.New("OS chiquvchi bayt hisoblagichi notoʻgʻri")
		}
		if err := addCounters(&stats, received, sent); err != nil {
			return Stats{}, err
		}
		seen[name] = true
	}
	if scanner.Err() != nil || len(seen) == 0 {
		return Stats{}, errors.New("OS interfeys hisoblagichlari topilmadi")
	}
	return stats, nil
}
