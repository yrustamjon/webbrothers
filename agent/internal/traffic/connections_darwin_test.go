//go:build darwin

package traffic

import (
	"strings"
	"testing"
)

func TestLsofOwnUserRemoteSocketsOnly(t *testing.T) {
	fixture := "p1\ncGoogle Chrome\nu501\nPTCP\nn127.0.0.1:4000->192.0.2.1:443\nn*:443\np2\ncFirefox\nu502\nPTCP\nn127.0.0.1:4001->198.51.100.1:443\np3\ncFirefox\nu501\nPUDP\nn[::1]:4444->[2001:db8::1]:53\nn127.0.0.1:4000->\n"
	rows, e := parseLsofConnections(strings.NewReader(fixture), "501")
	if e != nil || len(rows) != 2 {
		t.Fatal(rows, e)
	}
	if rows[0].DestinationIP != "192.0.2.1" || rows[0].Browser == nil || *rows[0].Browser != "chrome" {
		t.Fatal(rows[0])
	}
	if rows[1].DestinationIP != "2001:db8::1" || rows[1].Protocol != "udp" {
		t.Fatal(rows[1])
	}
}
func TestLsofBoundedWriter(t *testing.T) {
	w := &connectionOutput{limit: 4}
	if _, e := w.Write([]byte("12345")); e == nil || w.Len() != 0 {
		t.Fatal(e, w.Len())
	}
}
