package main

import (
	"bufio"
	"fmt"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"

	http "github.com/bogdanfinn/fhttp"
	"github.com/bogdanfinn/fhttp/http2"
	utls "github.com/bogdanfinn/utls"
	xproxy "golang.org/x/net/proxy"
)

// Upstream owns the server-facing leg: the leg whose ClientHello, HTTP/2
// SETTINGS and header order are the fingerprint. Everything here exists to make
// those three things match the emulated device rather than match Go.
type Upstream struct {
	profile *Profile
	dialer  proxyDialer

	mu    sync.Mutex
	conns map[string]*hostConn
}

type proxyDialer interface {
	Dial(network, addr string) (net.Conn, error)
}

type directDialer struct{ timeout time.Duration }

func (d directDialer) Dial(network, addr string) (net.Conn, error) {
	return net.DialTimeout(network, addr, d.timeout)
}

// httpConnectDialer routes through an ordinary HTTP proxy via CONNECT, which is
// what most residential/mobile proxy vendors hand out.
type httpConnectDialer struct {
	addr    string
	auth    string
	timeout time.Duration
}

func (d httpConnectDialer) Dial(network, addr string) (net.Conn, error) {
	c, err := net.DialTimeout("tcp", d.addr, d.timeout)
	if err != nil {
		return nil, err
	}
	req := "CONNECT " + addr + " HTTP/1.1\r\nHost: " + addr + "\r\n"
	if d.auth != "" {
		req += "Proxy-Authorization: Basic " + d.auth + "\r\n"
	}
	req += "\r\n"
	if _, err := c.Write([]byte(req)); err != nil {
		c.Close()
		return nil, err
	}
	buf := make([]byte, 0, 256)
	tmp := make([]byte, 1)
	for !strings.HasSuffix(string(buf), "\r\n\r\n") {
		n, err := c.Read(tmp)
		if err != nil || n == 0 {
			c.Close()
			return nil, fmt.Errorf("upstream CONNECT failed: %v", err)
		}
		buf = append(buf, tmp[0])
		if len(buf) > 4096 {
			c.Close()
			return nil, fmt.Errorf("upstream CONNECT response too large")
		}
	}
	if !strings.Contains(strings.SplitN(string(buf), "\r\n", 2)[0], " 200 ") {
		c.Close()
		return nil, fmt.Errorf("upstream CONNECT rejected: %s", strings.SplitN(string(buf), "\r\n", 2)[0])
	}
	return c, nil
}

func buildDialer(upstream string) (proxyDialer, error) {
	if upstream == "" {
		return directDialer{timeout: 30 * time.Second}, nil
	}
	u, err := url.Parse(upstream)
	if err != nil {
		return nil, fmt.Errorf("parse upstream %q: %w", upstream, err)
	}
	switch u.Scheme {
	case "socks5", "socks5h":
		var auth *xproxy.Auth
		if u.User != nil {
			pw, _ := u.User.Password()
			auth = &xproxy.Auth{User: u.User.Username(), Password: pw}
		}
		d, err := xproxy.SOCKS5("tcp", u.Host, auth, &net.Dialer{Timeout: 30 * time.Second})
		if err != nil {
			return nil, err
		}
		return d, nil
	case "http", "https":
		enc := ""
		if u.User != nil {
			pw, _ := u.User.Password()
			enc = basicAuth(u.User.Username(), pw)
		}
		return httpConnectDialer{addr: u.Host, auth: enc, timeout: 30 * time.Second}, nil
	default:
		return nil, fmt.Errorf("unsupported upstream scheme %q (want socks5:// or http://)", u.Scheme)
	}
}

type hostConn struct {
	h2   *http2.ClientConn
	raw  net.Conn
	br   *bufio.Reader
	isH2 bool
}

func NewUpstream(p *Profile) (*Upstream, error) {
	d, err := buildDialer(p.Upstream)
	if err != nil {
		return nil, err
	}
	return &Upstream{profile: p, dialer: d, conns: map[string]*hostConn{}}, nil
}

func (u *Upstream) h2Transport() *http2.Transport {
	p := u.profile
	settings := map[http2.SettingID]uint32{}
	var order []http2.SettingID
	for _, name := range p.HTTP2.SettingsOrder {
		id, ok := settingIDs[name]
		if !ok {
			continue
		}
		v, ok := p.HTTP2.Settings[name]
		if !ok {
			continue
		}
		settings[http2.SettingID(id)] = v
		order = append(order, http2.SettingID(id))
	}

	tr := &http2.Transport{
		Settings:      settings,
		SettingsOrder: order,
		// Chrome opens the connection window well beyond the 65535 default; Go's
		// silence here is one of the fields the Akamai fingerprint keys on.
		ConnectionFlow: p.HTTP2.ConnectionFlow,
		// Pseudo-header order is Chrome's m,a,s,p — Go's native order is
		// a,m,p,s, which by itself identifies the client as not-a-browser.
		PseudoHeaderOrder: p.HeaderOrder.H2Pseudo,
		// Pass compressed bodies straight through to the browser; decoding and
		// re-encoding here would change Content-Encoding and Content-Length.
		DisableCompression: true,
	}
	if hp := p.HTTP2.HeaderPriority; hp != nil {
		tr.HeaderPriority = &http2.PriorityParam{
			StreamDep: hp.StreamDep,
			Exclusive: hp.Exclusive,
			Weight:    hp.Weight,
		}
	}
	return tr
}

// dial performs the uTLS handshake that produces the target JA3/JA4. Plain
// HTTP has no handshake to shape, so it stays an ordinary TCP connection —
// wrapping it in TLS would simply fail.
func (u *Upstream) dial(scheme, host, port string) (*hostConn, error) {
	raw, err := u.dialer.Dial("tcp", net.JoinHostPort(host, port))
	if err != nil {
		return nil, err
	}
	if scheme == "http" {
		return &hostConn{raw: raw, br: bufio.NewReader(raw), isH2: false}, nil
	}
	uconn := utls.UClient(raw, &utls.Config{ServerName: host}, u.profile.HelloID(), false, false, false)
	if err := uconn.Handshake(); err != nil {
		raw.Close()
		return nil, fmt.Errorf("upstream TLS handshake with %s: %w", host, err)
	}
	if uconn.ConnectionState().NegotiatedProtocol == "h2" {
		cc, err := u.h2Transport().NewClientConn(uconn)
		if err != nil {
			uconn.Close()
			return nil, err
		}
		return &hostConn{h2: cc, raw: uconn, isH2: true}, nil
	}
	// HTTP/1.1 upstream: keep one buffered reader for the life of the
	// connection, or a pipelined response body would be read into a reader that
	// is then discarded.
	return &hostConn{raw: uconn, br: bufio.NewReader(uconn), isH2: false}, nil
}

func (u *Upstream) get(scheme, host, port string) (*hostConn, error) {
	key := scheme + "://" + host + ":" + port
	u.mu.Lock()
	c, ok := u.conns[key]
	u.mu.Unlock()
	if ok && c.isH2 && c.h2.CanTakeNewRequest() {
		return c, nil
	}
	c, err := u.dial(scheme, host, port)
	if err != nil {
		return nil, err
	}
	if c.isH2 {
		u.mu.Lock()
		u.conns[key] = c
		u.mu.Unlock()
	}
	return c, nil
}

func (u *Upstream) drop(scheme, host, port string) {
	key := scheme + "://" + host + ":" + port
	u.mu.Lock()
	if c, ok := u.conns[key]; ok {
		delete(u.conns, key)
		if c.raw != nil {
			c.raw.Close()
		}
	}
	u.mu.Unlock()
}

// RoundTrip sends one request over the fingerprinted connection. HTTP/1.1
// upstreams are written directly so that HeaderOrderKey still governs the wire
// order — Go's own Transport would re-sort them.
func (u *Upstream) RoundTrip(req *http.Request, scheme, host, port string) (*http.Response, error) {
	c, err := u.get(scheme, host, port)
	if err != nil {
		return nil, err
	}
	if c.isH2 {
		resp, err := c.h2.RoundTrip(req)
		if err != nil {
			u.drop(scheme, host, port)
			// One retry on a stale pooled connection; a second failure is real.
			c2, err2 := u.get(scheme, host, port)
			if err2 != nil {
				return nil, err
			}
			if c2.isH2 {
				return c2.h2.RoundTrip(req)
			}
			return writeH1(c2, req)
		}
		return resp, nil
	}
	return writeH1(c, req)
}

func writeH1(c *hostConn, req *http.Request) (*http.Response, error) {
	if err := req.Write(c.raw); err != nil {
		return nil, err
	}
	return http.ReadResponse(c.br, req)
}

// DialUpgrade opens a fresh connection for requests that leave HTTP behind —
// WebSocket, and anything else using the Upgrade mechanism. ALPN is narrowed to
// http/1.1 because the upgrade handshake does not exist over HTTP/2 (RFC 8441
// Extended CONNECT is a different mechanism, and not implemented here). The
// rest of the ClientHello is untouched, so the JA4 differs from the h2 one only
// in its ALPN field — exactly as it does for a real browser that ends up on an
// HTTP/1.1 connection.
func (u *Upstream) DialUpgrade(host, port string) (net.Conn, error) {
	raw, err := u.dialer.Dial("tcp", net.JoinHostPort(host, port))
	if err != nil {
		return nil, err
	}
	// withForceHttp1 narrows ALPN to http/1.1 while leaving every other byte of
	// the ClientHello alone, so the JA4 differs from the h2 one only in its ALPN
	// field — exactly as it does for a real browser that lands on HTTP/1.1.
	uconn := utls.UClient(raw, &utls.Config{ServerName: host}, u.profile.HelloID(), false, true, false)
	if err := uconn.Handshake(); err != nil {
		raw.Close()
		return nil, fmt.Errorf("upgrade TLS handshake with %s: %w", host, err)
	}
	return uconn, nil
}
