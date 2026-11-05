package transport

import (
	"context"
	"crypto/x509"
	"errors"
	"net"
	"net/url"
	"strings"
	"testing"
)

func TestConnectionErrorsAreUsefulWithoutLeakingRequestDetails(t *testing.T) {
	for _, test := range []struct {
		err  error
		want string
	}{
		{context.DeadlineExceeded, "vaqti tugadi"},
		{&net.DNSError{Err: "private-error", Name: "private.example"}, "domeni topilmadi"},
		{x509.UnknownAuthorityError{}, "sertifikati tasdiqlanmadi"},
		{&net.OpError{Op: "dial", Err: errors.New("private-error")}, "tarmoq ulanishi"},
		{errors.New("private-error"), "HTTPS serveriga"},
	} {
		wrapped := &url.Error{Op: "Post", URL: "https://user:private-password@private.example/token", Err: test.err}
		message := ConnectionError(wrapped).Error()
		if !strings.Contains(message, test.want) {
			t.Fatalf("expected class %q: %s", test.want, message)
		}
		for _, secret := range []string{"private-password", "private.example", "private-error", "/token"} {
			if strings.Contains(message, secret) {
				t.Fatal("network diagnostics leaked request details")
			}
		}
	}
}
