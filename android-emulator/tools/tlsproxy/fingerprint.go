package main

import (
	"crypto/md5"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"fmt"
	"net"
	"sort"
	"strconv"
	"strings"

	utls "github.com/bogdanfinn/utls"
)

// JA3 and JA4 are computed from the ClientHello we actually generate, not
// declared in a table. A hardcoded "expected" fingerprint is worth very little:
// it is right until the uTLS version moves, and then it is confidently wrong.

// GREASE values are excluded from every fingerprint. They follow the pattern
// 0x?a?a where both bytes are equal.
func isGREASE(v uint16) bool {
	return v&0x0f0f == 0x0a0a && byte(v>>8) == byte(v)
}

type clientHello struct {
	legacyVersion uint16
	ciphers       []uint16
	extensions    []uint16
	curves        []uint16
	pointFormats  []uint8
	sigAlgs       []uint16
	supportedVers []uint16
	alpn          []string
	hasSNI        bool
}

func parseClientHello(raw []byte) (*clientHello, error) {
	// raw starts at the handshake header: type(1) length(3).
	if len(raw) < 4 || raw[0] != 0x01 {
		return nil, fmt.Errorf("not a ClientHello")
	}
	b := raw[4:]
	read := func(n int) ([]byte, error) {
		if len(b) < n {
			return nil, fmt.Errorf("truncated ClientHello")
		}
		v := b[:n]
		b = b[n:]
		return v, nil
	}

	ch := &clientHello{}
	v, err := read(2)
	if err != nil {
		return nil, err
	}
	ch.legacyVersion = binary.BigEndian.Uint16(v)

	if _, err = read(32); err != nil { // random
		return nil, err
	}
	sidLen, err := read(1)
	if err != nil {
		return nil, err
	}
	if _, err = read(int(sidLen[0])); err != nil {
		return nil, err
	}

	csLen, err := read(2)
	if err != nil {
		return nil, err
	}
	cs, err := read(int(binary.BigEndian.Uint16(csLen)))
	if err != nil {
		return nil, err
	}
	for i := 0; i+1 < len(cs); i += 2 {
		c := binary.BigEndian.Uint16(cs[i:])
		if !isGREASE(c) {
			ch.ciphers = append(ch.ciphers, c)
		}
	}

	compLen, err := read(1)
	if err != nil {
		return nil, err
	}
	if _, err = read(int(compLen[0])); err != nil {
		return nil, err
	}

	if len(b) < 2 {
		return ch, nil // no extensions
	}
	extLen, _ := read(2)
	exts, err := read(int(binary.BigEndian.Uint16(extLen)))
	if err != nil {
		return nil, err
	}

	for len(exts) >= 4 {
		etype := binary.BigEndian.Uint16(exts)
		elen := int(binary.BigEndian.Uint16(exts[2:]))
		if len(exts) < 4+elen {
			break
		}
		data := exts[4 : 4+elen]
		exts = exts[4+elen:]

		if isGREASE(etype) {
			continue
		}
		ch.extensions = append(ch.extensions, etype)

		switch etype {
		case 0x0000: // server_name
			ch.hasSNI = true
		case 0x000a: // supported_groups
			if len(data) >= 2 {
				list := data[2:]
				for i := 0; i+1 < len(list); i += 2 {
					g := binary.BigEndian.Uint16(list[i:])
					if !isGREASE(g) {
						ch.curves = append(ch.curves, g)
					}
				}
			}
		case 0x000b: // ec_point_formats
			if len(data) >= 1 {
				for _, p := range data[1:] {
					ch.pointFormats = append(ch.pointFormats, p)
				}
			}
		case 0x000d: // signature_algorithms
			if len(data) >= 2 {
				list := data[2:]
				for i := 0; i+1 < len(list); i += 2 {
					s := binary.BigEndian.Uint16(list[i:])
					if !isGREASE(s) {
						ch.sigAlgs = append(ch.sigAlgs, s)
					}
				}
			}
		case 0x0010: // ALPN
			if len(data) >= 2 {
				list := data[2:]
				for len(list) >= 1 {
					n := int(list[0])
					if len(list) < 1+n {
						break
					}
					ch.alpn = append(ch.alpn, string(list[1:1+n]))
					list = list[1+n:]
				}
			}
		case 0x002b: // supported_versions
			if len(data) >= 1 {
				list := data[1:]
				for i := 0; i+1 < len(list); i += 2 {
					sv := binary.BigEndian.Uint16(list[i:])
					if !isGREASE(sv) {
						ch.supportedVers = append(ch.supportedVers, sv)
					}
				}
			}
		}
	}
	return ch, nil
}

func joinU16(v []uint16) string {
	parts := make([]string, len(v))
	for i, x := range v {
		parts[i] = strconv.Itoa(int(x))
	}
	return strings.Join(parts, "-")
}

// JA3 hashes the ClientHello in wire order. Chrome has shuffled its extension
// order on every connection since M110, so a Chrome JA3 is *expected* to differ
// run to run — a stable JA3 across connections is itself anomalous for Chrome.
func (ch *clientHello) JA3() (string, string) {
	pf := make([]string, len(ch.pointFormats))
	for i, p := range ch.pointFormats {
		pf[i] = strconv.Itoa(int(p))
	}
	s := strings.Join([]string{
		strconv.Itoa(int(ch.legacyVersion)),
		joinU16(ch.ciphers),
		joinU16(ch.extensions),
		joinU16(ch.curves),
		strings.Join(pf, "-"),
	}, ",")
	sum := md5.Sum([]byte(s))
	return s, hex.EncodeToString(sum[:])
}

func hexList(v []uint16) []string {
	out := make([]string, len(v))
	for i, x := range v {
		out[i] = fmt.Sprintf("%04x", x)
	}
	return out
}

func sha256Trunc(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])[:12]
}

// JA4 sorts the cipher and extension lists before hashing, which is exactly why
// it survives Chrome's shuffling where JA3 does not. Use it as the check that
// the handshake is right.
func (ch *clientHello) JA4() string {
	version := ch.legacyVersion
	for _, v := range ch.supportedVers {
		if v > version {
			version = v
		}
	}
	verStr := map[uint16]string{
		0x0304: "13", 0x0303: "12", 0x0302: "11", 0x0301: "10",
	}[version]
	if verStr == "" {
		verStr = "00"
	}

	sni := "i"
	if ch.hasSNI {
		sni = "d"
	}

	cap2 := func(n int) string {
		if n > 99 {
			n = 99
		}
		return fmt.Sprintf("%02d", n)
	}

	alpn := "00"
	if len(ch.alpn) > 0 && len(ch.alpn[0]) > 0 {
		first := ch.alpn[0]
		alpn = string(first[0]) + string(first[len(first)-1])
	}

	a := "t" + verStr + sni + cap2(len(ch.ciphers)) + cap2(len(ch.extensions)) + alpn

	ciphers := hexList(ch.ciphers)
	sort.Strings(ciphers)
	b := sha256Trunc(strings.Join(ciphers, ","))

	// JA4_c excludes SNI (0x0000) and ALPN (0x0010) from the extension list —
	// they are already represented in JA4_a — and appends the signature
	// algorithms in their original, unsorted order.
	var extFiltered []uint16
	for _, e := range ch.extensions {
		if e == 0x0000 || e == 0x0010 {
			continue
		}
		extFiltered = append(extFiltered, e)
	}
	exts := hexList(extFiltered)
	sort.Strings(exts)
	c := sha256Trunc(strings.Join(exts, ",") + "_" + strings.Join(hexList(ch.sigAlgs), ","))

	return a + "_" + b + "_" + c
}

// Fingerprint builds one ClientHello with the profile's template and reports
// what it hashes to, so `--print-fingerprint` shows the real value rather than
// a claim.
func Fingerprint(p *Profile, serverName string) (ja3 string, ja3Hash string, ja4 string, err error) {
	c1, c2 := net.Pipe()
	defer c1.Close()
	defer c2.Close()

	uconn := utls.UClient(c1, &utls.Config{ServerName: serverName}, p.HelloID(), false, false, false)
	defer uconn.Close()
	if err = uconn.BuildHandshakeState(); err != nil {
		return "", "", "", fmt.Errorf("build ClientHello: %w", err)
	}
	ch, err := parseClientHello(uconn.HandshakeState.Hello.Raw)
	if err != nil {
		return "", "", "", err
	}
	ja3, ja3Hash = ch.JA3()
	return ja3, ja3Hash, ch.JA4(), nil
}
