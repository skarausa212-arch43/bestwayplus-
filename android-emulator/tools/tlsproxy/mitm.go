package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// The browser-facing half of the proxy. Traffic between Chromium and this
// process is re-encrypted under a locally generated CA, which is what makes the
// upstream leg rewritable at all. That CA is trusted *only* by the browser this
// tool launches — it is written per run into the profile directory and never
// installed into the system trust store.
type CertAuthority struct {
	cert   *x509.Certificate
	key    *rsa.PrivateKey
	pemDER []byte

	mu    sync.Mutex
	cache map[string]*tls.Certificate
	leaf  *ecdsa.PrivateKey
}

func LoadOrCreateCA(dir string) (*CertAuthority, error) {
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	certPath := filepath.Join(dir, "ca.crt")
	keyPath := filepath.Join(dir, "ca.key")

	certPEM, cErr := os.ReadFile(certPath)
	keyPEM, kErr := os.ReadFile(keyPath)
	if cErr == nil && kErr == nil {
		blockC, _ := pem.Decode(certPEM)
		blockK, _ := pem.Decode(keyPEM)
		if blockC != nil && blockK != nil {
			cert, err1 := x509.ParseCertificate(blockC.Bytes)
			key, err2 := x509.ParsePKCS1PrivateKey(blockK.Bytes)
			if err1 == nil && err2 == nil && time.Now().Before(cert.NotAfter) {
				return newCA(cert, key, blockC.Bytes)
			}
		}
	}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return nil, err
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject: pkix.Name{
			CommonName:   "Android Device Emulator local CA",
			Organization: []string{"android-device-emulator"},
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().AddDate(1, 0, 0),
		KeyUsage:              x509.KeyUsageCertSign | x509.KeyUsageDigitalSignature,
		BasicConstraintsValid: true,
		IsCA:                  true,
		MaxPathLen:            1,
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, err
	}
	cert, err := x509.ParseCertificate(der)
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(certPath, pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der}), 0o600); err != nil {
		return nil, err
	}
	if err := os.WriteFile(keyPath, pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}), 0o600); err != nil {
		return nil, err
	}
	return newCA(cert, key, der)
}

func newCA(cert *x509.Certificate, key *rsa.PrivateKey, der []byte) (*CertAuthority, error) {
	// One reused P-256 key for every leaf: issuing certs is on the hot path of
	// each new host, and RSA keygen there would show up as latency the emulated
	// device should not have.
	leaf, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	return &CertAuthority{
		cert:   cert,
		key:    key,
		pemDER: der,
		cache:  map[string]*tls.Certificate{},
		leaf:   leaf,
	}, nil
}

func (ca *CertAuthority) CertPEM() []byte {
	return pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: ca.pemDER})
}

func (ca *CertAuthority) For(host string) (*tls.Certificate, error) {
	ca.mu.Lock()
	defer ca.mu.Unlock()
	if c, ok := ca.cache[host]; ok {
		return c, nil
	}

	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, err
	}
	tmpl := &x509.Certificate{
		SerialNumber: serial,
		Subject:      pkix.Name{CommonName: host},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().AddDate(0, 3, 0),
		KeyUsage:     x509.KeyUsageDigitalSignature | x509.KeyUsageKeyEncipherment,
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
	}
	if ip := net.ParseIP(host); ip != nil {
		tmpl.IPAddresses = []net.IP{ip}
	} else {
		tmpl.DNSNames = []string{host}
	}

	der, err := x509.CreateCertificate(rand.Reader, tmpl, ca.cert, &ca.leaf.PublicKey, ca.key)
	if err != nil {
		return nil, fmt.Errorf("issue leaf for %s: %w", host, err)
	}
	crt := &tls.Certificate{
		Certificate: [][]byte{der, ca.pemDER},
		PrivateKey:  ca.leaf,
	}
	ca.cache[host] = crt
	return crt, nil
}
