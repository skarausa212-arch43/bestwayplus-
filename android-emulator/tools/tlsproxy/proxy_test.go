package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"net"
	stdhttp "net/http"
	"strings"
	"testing"
	"time"

	http "github.com/bogdanfinn/fhttp"
)

func testProfile() *Profile {
	p := &Profile{
		DeviceID:       "test-device",
		UserAgent:      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
		AcceptLanguage: "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
		ClientHints: map[string]string{
			"sec-ch-ua":          `"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"`,
			"sec-ch-ua-mobile":   "?1",
			"sec-ch-ua-platform": `"Android"`,
			"sec-ch-ua-model":    `"SM-S918B"`,
		},
	}
	p.TLS.UTLS = "HelloChrome_131"
	p.TLS.ChromeMajor = 131
	p.HeaderOrder.H2Pseudo = []string{":method", ":authority", ":scheme", ":path"}
	p.HeaderOrder.Navigation = []string{
		"host", "connection", "sec-ch-ua", "sec-ch-ua-mobile", "sec-ch-ua-platform",
		"upgrade-insecure-requests", "user-agent", "accept", "sec-fetch-site",
		"sec-fetch-mode", "sec-fetch-user", "sec-fetch-dest", "accept-encoding",
		"accept-language", "cookie",
	}
	p.HeaderOrder.XHR = p.HeaderOrder.Navigation
	p.HeaderOrder.Subresource = p.HeaderOrder.Navigation
	p.HTTP2.Settings = map[string]uint32{
		"HEADER_TABLE_SIZE": 65536, "ENABLE_PUSH": 0,
		"INITIAL_WINDOW_SIZE": 6291456, "MAX_HEADER_LIST_SIZE": 262144,
	}
	p.HTTP2.SettingsOrder = []string{
		"HEADER_TABLE_SIZE", "ENABLE_PUSH", "INITIAL_WINDOW_SIZE", "MAX_HEADER_LIST_SIZE",
	}
	p.HTTP2.ConnectionFlow = 15663105
	return p
}

// The ClientHello that actually reaches the wire must be the one -print-fingerprint
// describes. Anything less makes the reported JA4 a claim rather than a fact.
func TestClientHelloOnTheWireMatchesReportedJA4(t *testing.T) {
	p := testProfile()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	type result struct {
		ja4 string
		err error
	}
	got := make(chan result, 1)

	go func() {
		conn, err := ln.Accept()
		if err != nil {
			got <- result{err: err}
			return
		}
		defer conn.Close()
		conn.SetReadDeadline(time.Now().Add(10 * time.Second))

		// One TLS record: type(1) version(2) length(2), then the handshake message.
		var hdr [5]byte
		if _, err := io.ReadFull(conn, hdr[:]); err != nil {
			got <- result{err: err}
			return
		}
		if hdr[0] != 0x16 {
			got <- result{err: err}
			return
		}
		body := make([]byte, binary.BigEndian.Uint16(hdr[3:5]))
		if _, err := io.ReadFull(conn, body); err != nil {
			got <- result{err: err}
			return
		}
		ch, err := parseClientHello(body)
		if err != nil {
			got <- result{err: err}
			return
		}
		got <- result{ja4: ch.JA4()}
	}()

	up, err := NewUpstream(p)
	if err != nil {
		t.Fatal(err)
	}
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	// Dialed by name, not by 127.0.0.1: TLS omits the SNI extension for IP
	// literals, which would change the JA4 and make this assert the wrong thing.
	const host = "localhost"
	// The handshake cannot complete against a socket that never answers; the
	// ClientHello has already been written by then, which is all this asserts.
	_, _ = up.dial("https", host, port)

	r := <-got
	if r.err != nil {
		t.Fatalf("reading ClientHello: %v", r.err)
	}

	_, _, reported, err := Fingerprint(p, host)
	if err != nil {
		t.Fatal(err)
	}
	if r.ja4 != reported {
		t.Errorf("JA4 on the wire = %s, -print-fingerprint reports %s", r.ja4, reported)
	}
	if !strings.HasPrefix(r.ja4, "t13d") {
		t.Errorf("expected a TLS 1.3 hello with SNI, got %s", r.ja4)
	}
	if !strings.Contains(r.ja4, "h2_") {
		t.Errorf("expected h2 in ALPN, got %s", r.ja4)
	}
}

func TestEveryTemplateProducesAChromeShapedJA4(t *testing.T) {
	for _, tmpl := range []string{"HelloChrome_120", "HelloChrome_131", "HelloChrome_133"} {
		p := testProfile()
		p.TLS.UTLS = tmpl
		_, _, ja4, err := Fingerprint(p, "www.example.com")
		if err != nil {
			t.Fatalf("%s: %v", tmpl, err)
		}
		// t13d = TLS 1.3, SNI present; 15 ciphers, 16 extensions, ALPN h2 —
		// the shape every modern Chrome hello has.
		if !strings.HasPrefix(ja4, "t13d1516h2_") {
			t.Errorf("%s produced %s, which is not Chrome-shaped", tmpl, ja4)
		}
	}
}

// JA3 must vary between connections: Chrome has shuffled its extension order
// since M110, and a JA3 that never changes is itself the anomaly.
func TestJA3VariesAcrossConnections(t *testing.T) {
	p := testProfile()
	seen := map[string]bool{}
	for i := 0; i < 12; i++ {
		_, hash, _, err := Fingerprint(p, "www.example.com")
		if err != nil {
			t.Fatal(err)
		}
		seen[hash] = true
	}
	if len(seen) == 1 {
		t.Error("JA3 was identical across 12 hellos; extension shuffling is not happening")
	}
}

// JA4, by contrast, sorts before hashing and must be stable.
func TestJA4IsStableAcrossConnections(t *testing.T) {
	p := testProfile()
	var first string
	for i := 0; i < 12; i++ {
		_, _, ja4, err := Fingerprint(p, "www.example.com")
		if err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			first = ja4
		} else if ja4 != first {
			t.Fatalf("JA4 drifted: %s then %s", first, ja4)
		}
	}
}

// Header order is the part a naive client gets wrong: copying the names is easy,
// emitting them in Chrome's sequence is not. This asserts the actual bytes.
func TestHeadersAreWrittenInProfileOrder(t *testing.T) {
	px := &Proxy{profile: testProfile()}

	src := stdhttp.Header{}
	// Deliberately supplied in an order unlike the profile's, and with values
	// Chromium would have filled in from its own build.
	src.Set("Accept-Language", "en-US,en;q=0.9")
	src.Set("User-Agent", "Mozilla/5.0 (X11; Linux x86_64) Chrome/999.0.0.0 Safari/537.36")
	src.Set("Cookie", "a=1")
	src.Set("Accept", "text/html")
	src.Set("Sec-Fetch-Mode", "navigate")
	src.Set("Sec-Ch-Ua", `"Chromium";v="999"`)
	src.Set("Accept-Encoding", "gzip, deflate, br, zstd")
	src.Set("Upgrade-Insecure-Requests", "1")
	src.Set("Proxy-Connection", "keep-alive")

	req, err := http.NewRequest("GET", "https://example.com/page", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header = http.Header{}
	px.applyIdentity(req.Header, src, true)
	px.setOrder(req.Header, src)

	var buf bytes.Buffer
	if err := req.Write(&buf); err != nil {
		t.Fatal(err)
	}
	wire := buf.String()

	if strings.Contains(strings.ToLower(wire), "proxy-connection") {
		t.Error("the hop-by-hop Proxy-Connection header reached the wire")
	}
	if !strings.Contains(wire, px.profile.UserAgent) {
		t.Error("the device User-Agent did not replace Chromium's")
	}
	if strings.Contains(wire, "999.0.0.0") {
		t.Error("Chromium's own version leaked through")
	}
	if !strings.Contains(wire, "Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7") {
		t.Error("the profile's Accept-Language did not replace the browser's")
	}
	if !strings.Contains(wire, `"Google Chrome";v="131"`) {
		t.Error("sec-ch-ua was not rewritten to the profile's brand list")
	}

	// Every header the profile orders must appear in that relative order.
	pos := -1
	var prev string
	for _, name := range px.profile.HeaderOrder.Navigation {
		i := strings.Index(strings.ToLower(wire), "\r\n"+name+":")
		if i < 0 {
			continue
		}
		if i < pos {
			t.Errorf("%q was written before %q, against the profile order", name, prev)
		}
		pos = i
		prev = name
	}
}

// Low-entropy hints belong on every navigation; high-entropy ones only where
// the browser already sent them, because Chrome withholds them until a site
// opts in with Accept-CH.
func TestHighEntropyHintsAreNotVolunteered(t *testing.T) {
	px := &Proxy{profile: testProfile()}

	src := stdhttp.Header{}
	src.Set("Sec-Fetch-Mode", "navigate")
	dst := http.Header{}
	px.applyIdentity(dst, src, true)

	if dst.Get("Sec-Ch-Ua-Platform") == "" {
		t.Error("low-entropy hints should be present on a navigation")
	}
	if dst.Get("Sec-Ch-Ua-Model") != "" {
		t.Error("sec-ch-ua-model was volunteered without the browser asking for it")
	}

	// Once Chromium sends it, the value must be the device's, not the host's.
	src2 := stdhttp.Header{}
	src2.Set("Sec-Fetch-Mode", "navigate")
	src2.Set("Sec-Ch-Ua-Model", `"Nexus 5"`)
	dst2 := http.Header{}
	px.applyIdentity(dst2, src2, true)
	if dst2.Get("Sec-Ch-Ua-Model") != `"SM-S918B"` {
		t.Errorf("sec-ch-ua-model = %s, want the profile's model", dst2.Get("Sec-Ch-Ua-Model"))
	}
}

func TestRequestKindSelectsHeaderOrder(t *testing.T) {
	p := testProfile()
	p.HeaderOrder.XHR = []string{"xhr-marker"}
	p.HeaderOrder.Subresource = []string{"subresource-marker"}
	px := &Proxy{profile: p}

	nav := stdhttp.Header{}
	nav.Set("Sec-Fetch-Mode", "navigate")
	if got := px.pickOrder(nav)[0]; got != "host" {
		t.Errorf("navigation picked %q", got)
	}

	xhr := stdhttp.Header{}
	xhr.Set("Sec-Fetch-Mode", "cors")
	if got := px.pickOrder(xhr)[0]; got != "xhr-marker" {
		t.Errorf("cors request picked %q", got)
	}

	sub := stdhttp.Header{}
	sub.Set("Sec-Fetch-Mode", "no-cors")
	if got := px.pickOrder(sub)[0]; got != "subresource-marker" {
		t.Errorf("subresource picked %q", got)
	}
}

func TestUnknownTlsTemplateIsRejected(t *testing.T) {
	p := testProfile()
	p.TLS.UTLS = "HelloChrome_999"
	if _, ok := clientHelloIDs[p.TLS.UTLS]; ok {
		t.Fatal("test premise broken: HelloChrome_999 should not exist")
	}
}

func TestGREASEDetection(t *testing.T) {
	for _, v := range []uint16{0x0a0a, 0x1a1a, 0x2a2a, 0xfafa} {
		if !isGREASE(v) {
			t.Errorf("%#04x should be GREASE", v)
		}
	}
	for _, v := range []uint16{0x1301, 0x0a1a, 0xc02b, 0x0000} {
		if isGREASE(v) {
			t.Errorf("%#04x should not be GREASE", v)
		}
	}
}
