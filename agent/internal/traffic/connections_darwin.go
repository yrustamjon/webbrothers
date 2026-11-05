//go:build darwin

package traffic

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"
)

type connectionOutput struct {
	bytes.Buffer
	limit int
}

func (w *connectionOutput) Write(p []byte) (int, error) {
	if len(p) > w.limit-w.Len() {
		return 0, errors.New("Socket javobi chegaradan katta")
	}
	return w.Buffer.Write(p)
}
func parseLsofConnections(r io.Reader, uid string) ([]Connection, error) {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 4096), 65536)
	out := []Connection{}
	currentUID, command, protocol := "", "", ""
	for scanner.Scan() {
		line := scanner.Text()
		if len(line) < 2 {
			continue
		}
		switch line[0] {
		case 'p':
			currentUID = ""
			command = ""
			protocol = ""
		case 'u':
			currentUID = line[1:]
		case 'c':
			command = line[1:]
		case 'P':
			protocol = strings.ToLower(line[1:])
		case 'n':
			if currentUID != uid || (protocol != "tcp" && protocol != "udp") {
				continue
			}
			parts := strings.Split(line[1:], "->")
			if len(parts) != 2 {
				continue
			}
			fields := strings.Fields(parts[1])
			if len(fields) == 0 {
				continue
			}
			ip, port, ok := connectionEndpoint(fields[0])
			if !ok {
				continue
			}
			br := browserFromProcess(command)
			attribution := "unknown"
			if br != nil {
				attribution = "browser"
			}
			out = append(out, Connection{DestinationIP: ip, Port: port, Protocol: protocol, Browser: br, Attribution: attribution})
			if len(out) >= maxConnections {
				return out, nil
			}
		}
	}
	return out, scanner.Err()
}
func collectConnections(ctx context.Context) ([]Connection, string, string, error) {
	uid := strconv.Itoa(os.Getuid())
	cmd := exec.CommandContext(ctx, "/usr/sbin/lsof", "-nP", "+c", "0", "-a", "-u", uid, "-i", "-FpcuPn")
	buf := &connectionOutput{limit: 2 << 20}
	cmd.Stdout = buf
	cmd.Stderr = io.Discard
	err := cmd.Run()
	if ctx.Err() != nil {
		return nil, "", "", ctx.Err()
	}
	if err != nil && buf.Len() == 0 {
		var exit *exec.ExitError
		if errors.As(err, &exit) && exit.ExitCode() == 1 {
			return []Connection{}, "available", "Faqat joriy OS hisobidagi kuzatilgan socketlar; profil va baytlar mavjud emas", nil
		}
		return nil, "permission_required", "Joriy OS hisobi socket jadvalini oʻqishga ruxsat bermadi", nil
	}
	if err != nil {
		return nil, "unsupported", "Socket javobi chegaralangan yoki yigʻish bajarilmadi", nil
	}
	items, e := parseLsofConnections(bytes.NewReader(buf.Bytes()), uid)
	return items, "available", "Faqat joriy OS hisobidagi kuzatilgan socketlar; profil va baytlar mavjud emas", e
}
