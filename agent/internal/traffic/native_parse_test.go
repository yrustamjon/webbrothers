package traffic

import (
	"strings"
	"testing"
	"time"
)

const darwinHeader = "Name Mtu Network Address Ipkts Ierrs Ibytes Opkts Oerrs Obytes Coll\n"

func TestDarwinLinkCountersOnly(t *testing.T) {
	output := darwinHeader +
		"lo0 16384 <Link#1> 10 0 9999 10 0 9999 0\n" +
		"en0 1500 <Link#2> aa:bb:cc:dd:ee:ff 3 0 300 4 0 400 0\n" +
		"en0 1500 192.0.2/24 192.0.2.1 3 - 300 4 - 400 -\n" +
		"utun0* 1380 <Link#3> 2 0 20 5 0 50 0\n"
	got, err := parseDarwin([]byte(output))
	if err != nil || got.Received != 320 || got.Sent != 450 || got.Attribution != "device" {
		t.Fatalf("unexpected totals: %+v %v", got, err)
	}
	if _, err := time.Parse(time.RFC3339, got.CollectedAt); err != nil {
		t.Fatal(err)
	}
}

func TestDarwinRejectsMissingMalformedAndOverflowCounters(t *testing.T) {
	for _, output := range []string{
		"", "Name Mtu Network\n", darwinHeader,
		darwinHeader + "lo0 16384 <Link#1> 10 0 9999 10 0 9999 0\n",
		darwinHeader + "en0 1500 <Link#2> 1 0 bad 1 0 4 0\n",
		darwinHeader + "en0 1500 <Link#2> 1 0 -1 1 0 4 0\n",
		darwinHeader + "en0 1500 <Link#2> 1 0 18446744073709551615 1 0 4 0\nen1 1500 <Link#3> 1 0 1 1 0 0 0\n",
		darwinHeader + strings.Repeat("en0 1500 <Link#2> 1 0 2 1 0 4 0\n", 2),
	} {
		if _, err := parseDarwin([]byte(output)); err == nil {
			t.Fatal("invalid Darwin counters accepted")
		}
	}
}
