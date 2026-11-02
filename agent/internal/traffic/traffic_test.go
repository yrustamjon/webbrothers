package traffic

import (
	"bufio"
	"strings"
	"testing"
)

func TestRealFormatAndNoProfileAttribution(t *testing.T) {
	r, e := Parse(bufio.NewScanner(strings.NewReader("Inter-| Receive\n lo: 999 0 0 0 0 0 0 0 999 0 0 0 0 0 0 0\n eth0: 123 0 0 0 0 0 0 0 456 0 0 0 0 0 0 0\n")))
	if e != nil || r.Received != 123 || r.Sent != 456 || r.Attribution != "device" {
		t.Fatalf("%+v %v", r, e)
	}
	if _, e = Parse(bufio.NewScanner(strings.NewReader("eth0: bad"))); e == nil {
		t.Fatal("bad collector format")
	}
}
