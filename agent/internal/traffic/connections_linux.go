//go:build linux

package traffic

import (
	"bufio"
	"context"
	"encoding/hex"
	"errors"
	"io"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
)

func procEndpoint(raw string) (string, int, bool) {
	parts := strings.Split(raw, ":")
	if len(parts) != 2 {
		return "", 0, false
	}
	b, e := hex.DecodeString(parts[0])
	if e != nil || (len(b) != 4 && len(b) != 16) {
		return "", 0, false
	}
	for i := 0; i < len(b); i += 4 {
		b[i], b[i+3] = b[i+3], b[i]
		b[i+1], b[i+2] = b[i+2], b[i+1]
	}
	p, e := strconv.ParseUint(parts[1], 16, 16)
	ip := net.IP(b)
	if e != nil || p == 0 || ip.IsUnspecified() {
		return "", 0, false
	}
	return ip.String(), int(p), true
}

type procConnection struct {
	value Connection
	inode string
}

func parseProcConnections(ctx context.Context, r io.Reader, uid, protocol string) ([]procConnection, error) {
	s := bufio.NewScanner(io.LimitReader(r, 2<<20))
	out := []procConnection{}
	for s.Scan() {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		f := strings.Fields(s.Text())
		if len(f) < 10 || f[0] == "sl" || f[7] != uid {
			continue
		}
		ip, p, ok := procEndpoint(f[2])
		if !ok {
			continue
		}
		out = append(out, procConnection{value: Connection{DestinationIP: ip, Port: p, Protocol: protocol, Attribution: "unknown"}, inode: f[9]})
		if len(out) >= maxConnections {
			break
		}
	}
	return out, s.Err()
}
func processBrowsers(ctx context.Context, root string, uid uint32) map[string]string {
	found := map[string]string{}
	procDir, e := os.Open(root)
	if e != nil {
		return found
	}
	entries, _ := procDir.Readdirnames(8192)
	procDir.Close()
	processed, totalFD := 0, 0
	for _, entry := range entries {
		if ctx.Err() != nil || processed >= 2048 || totalFD >= 32768 {
			break
		}
		if _, e := strconv.Atoi(entry); e != nil {
			continue
		}
		dir := filepath.Join(root, entry)
		info, e := os.Stat(dir)
		if e != nil {
			continue
		}
		st, ok := info.Sys().(*syscall.Stat_t)
		if !ok || st.Uid != uid {
			continue
		}
		processed++
		f, e := os.Open(filepath.Join(dir, "comm"))
		if e != nil {
			continue
		}
		raw, e := io.ReadAll(io.LimitReader(f, 128))
		f.Close()
		if e != nil {
			continue
		}
		browser := browserFromProcess(strings.TrimSpace(string(raw)))
		if browser == nil {
			continue
		}
		fdDir, e := os.Open(filepath.Join(dir, "fd"))
		if e != nil {
			continue
		}
		fds, _ := fdDir.Readdirnames(4096)
		fdDir.Close()
		for _, fd := range fds {
			totalFD++
			if totalFD > 32768 || ctx.Err() != nil {
				break
			}
			target, e := os.Readlink(filepath.Join(dir, "fd", fd))
			if e == nil && strings.HasPrefix(target, "socket:[") && strings.HasSuffix(target, "]") {
				inode := strings.TrimSuffix(strings.TrimPrefix(target, "socket:["), "]")
				if old, ok := found[inode]; ok && old != *browser {
					found[inode] = ""
				} else if !ok {
					found[inode] = *browser
				}
			}
		}
	}
	return found
}
func collectConnections(ctx context.Context) ([]Connection, string, string, error) {
	uid := os.Getuid()
	all := []procConnection{}
	opened := false
	for _, table := range []string{"tcp", "tcp6", "udp", "udp6"} {
		if err := ctx.Err(); err != nil {
			return nil, "", "", err
		}
		f, e := os.Open(filepath.Join("/proc/net", table))
		if e != nil {
			continue
		}
		opened = true
		protocol := strings.TrimSuffix(table, "6")
		rows, e := parseProcConnections(ctx, f, strconv.Itoa(uid), protocol)
		f.Close()
		if e != nil {
			return nil, "", "", errors.New("Socket jadvalini oʻqib boʻlmadi")
		}
		all = append(all, rows...)
		if len(all) >= maxConnections {
			all = all[:maxConnections]
			break
		}
	}
	if !opened {
		return nil, "permission_required", "Joriy OS hisobi /proc socket jadvalini oʻqiy olmadi", nil
	}
	browsers := processBrowsers(ctx, "/proc", uint32(uid))
	if err := ctx.Err(); err != nil {
		return nil, "", "", err
	}
	out := make([]Connection, 0, len(all))
	for _, row := range all {
		v := row.value
		if id := browsers[row.inode]; id != "" {
			v.Browser = &id
			v.Attribution = "browser"
		}
		out = append(out, v)
	}
	return out, "available", "Faqat joriy OS hisobidagi kuzatilgan socketlar; profil va baytlar mavjud emas", nil
}
