//go:build linux

package traffic

import (
	"context"
	"strings"
	"testing"
)

func TestProcOwnUserRemoteSocketsOnly(t *testing.T) {
	fixture := "  sl local_address rem_address st tx_queue rx_queue tr tm->when retrnsmt uid timeout inode\n 0: 0100007F:C350 010200C0:01BB 01 0:0 0:0 0 1000 0 123\n 1: 0100007F:C351 010233C6:01BB 01 0:0 0:0 0 1001 0 124\n 2: 00000000:0016 00000000:0000 0A 0:0 0:0 0 1000 0 125\n"
	rows, e := parseProcConnections(context.Background(), strings.NewReader(fixture), "1000", "tcp")
	if e != nil || len(rows) != 1 {
		t.Fatal(rows, e)
	}
	if rows[0].value.DestinationIP != "192.0.2.1" || rows[0].value.Port != 443 || rows[0].inode != "123" {
		t.Fatal(rows[0])
	}
	if ip, p, ok := procEndpoint("00000000000000000000000001000000:0035"); !ok || ip != "::1" || p != 53 {
		t.Fatal(ip, p, ok)
	}
}
