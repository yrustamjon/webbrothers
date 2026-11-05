package transport

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"net"
)

// ConnectionError deliberately omits URLs, proxy credentials and certificate data.
func ConnectionError(err error) error {
	var timeout net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &timeout) && timeout.Timeout()) {
		return errors.New("HTTPS ulanish vaqti tugadi. Internet/ngrok holatini tekshirib, menyudan qayta urinib koʻring")
	}
	var dns *net.DNSError
	if errors.As(err, &dns) {
		return errors.New("Server domeni topilmadi. Ngrok manzili va DNS/internet ulanishini tekshiring")
	}
	var authority x509.UnknownAuthorityError
	var hostname x509.HostnameError
	var invalid x509.CertificateInvalidError
	var certificate *tls.CertificateVerificationError
	if errors.As(err, &authority) || errors.As(err, &hostname) || errors.As(err, &invalid) || errors.As(err, &certificate) {
		return errors.New("HTTPS sertifikati tasdiqlanmadi. Kompyuter sanasi va server sertifikatiga ishonchni tekshiring; TLS tekshiruvini oʻchirmang")
	}
	var record tls.RecordHeaderError
	if errors.As(err, &record) {
		return errors.New("Server bu portda HTTPS bermayapti. Toʻgʻri HTTPS/ngrok manzilini kiriting")
	}
	var operation *net.OpError
	if errors.As(err, &operation) && operation.Op == "dial" {
		return errors.New("Serverga tarmoq ulanishi ochilmadi. Ngrok, internet va VPN/proksi sozlamalarini tekshiring")
	}
	return errors.New("HTTPS serveriga ulanib boʻlmadi. Server/ngrok manzilini brauzerda tekshirib, menyudan qayta urinib koʻring")
}
