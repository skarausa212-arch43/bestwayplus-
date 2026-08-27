// Command tlsproxy is the network half of the Android device emulator.
//
// The browser can be told to claim any User-Agent it likes, but it cannot be
// told to change its TLS ClientHello, its HTTP/2 SETTINGS, or the order it
// writes headers in — those are compiled into Chromium. So the browser talks to
// this process over a locally trusted MITM certificate, and this process
// re-originates every request with the emulated device's handshake.
//
// Run with -print-fingerprint to see the JA3/JA4 a profile actually produces.
package main

import (
	"bufio"
	"crypto/tls"
	"encoding/base64"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	stdhttp "net/http"
	"os"
	"strings"
	"sync"

	http "github.com/bogdanfinn/fhttp"
)

func basicAuth(user, pass string) string {
	return base64.StdEncoding.EncodeToString([]byte(user + ":" + pass))
}

// Hop-by-hop headers must not be forwarded; `Proxy-Connection` in particular
// would announce that a proxy is in the path.
var hopByHop = map[string]bool{
	"connection":          true,
	"proxy-connection":    true,
	"keep-alive":          true,
	"proxy-authenticate":  true,
	"proxy-authorization": true,
	"te":                  true,
	"trailer":             true,
	"transfer-encoding":   true,
	"upgrade":             true,
}

type Proxy struct {
	profile  *Profile
	ca       *CertAuthority
	upstream *Upstream
	verbose  bool

	tlsConfMu sync.Mutex
	tlsConfs  map[string]*tls.Config
}

func (px *Proxy) logf(format string, args ...any) {
	if px.verbose {
		log.Printf(format, args...)
	}
}

// ---------------------------------------------------------------------------
// header identity

// pickOrder chooses which of the profile's header orders applies. Chrome emits
// a different sequence for a navigation, an XHR/fetch, and a subresource load;
// using one order for everything is a subtler version of using none.
func (px *Proxy) pickOrder(h stdhttp.Header) []string {
	mode := strings.ToLower(h.Get("Sec-Fetch-Mode"))
	switch {
	case mode == "navigate":
		return px.profile.HeaderOrder.Navigation
	case mode == "cors", mode == "same-origin", h.Get("Origin") != "":
		return px.profile.HeaderOrder.XHR
	default:
		return px.profile.HeaderOrder.Subresource
	}
}

// applyIdentity overwrites the values Chromium filled in from its own build
// with the emulated device's. Client hints are *overwritten where present*
// rather than added unconditionally: Chrome only sends the high-entropy hints
// after a site opts in with Accept-CH, so volunteering sec-ch-ua-model on every
// request would be its own anomaly.
func (px *Proxy) applyIdentity(dst http.Header, src stdhttp.Header, isNav bool) {
	for k, vs := range src {
		if hopByHop[strings.ToLower(k)] {
			continue
		}
		dst[k] = append([]string(nil), vs...)
	}

	dst.Set("User-Agent", px.profile.UserAgent)
	if px.profile.AcceptLanguage != "" {
		dst.Set("Accept-Language", px.profile.AcceptLanguage)
	}

	for name, value := range px.profile.ClientHints {
		canon := stdhttp.CanonicalHeaderKey(name)
		low := strings.ToLower(name)
		lowEntropy := low == "sec-ch-ua" || low == "sec-ch-ua-mobile" || low == "sec-ch-ua-platform"
		if _, present := dst[canon]; present || (isNav && lowEntropy) {
			dst.Set(canon, value)
		}
	}
}

func (px *Proxy) setOrder(dst http.Header, src stdhttp.Header) {
	order := px.pickOrder(src)
	lower := make([]string, len(order))
	copy(lower, order)
	dst[http.HeaderOrderKey] = lower
	dst[http.PHeaderOrderKey] = px.profile.HeaderOrder.H2Pseudo
}

// ---------------------------------------------------------------------------
// request handling

func (px *Proxy) forward(w io.Writer, req *stdhttp.Request, scheme, host, port string) error {
	target := scheme + "://" + net.JoinHostPort(host, port) + req.URL.RequestURI()
	if (scheme == "https" && port == "443") || (scheme == "http" && port == "80") {
		target = scheme + "://" + host + req.URL.RequestURI()
	}

	outReq, err := http.NewRequest(req.Method, target, req.Body)
	if err != nil {
		return err
	}
	outReq.Header = http.Header{}
	isNav := strings.EqualFold(req.Header.Get("Sec-Fetch-Mode"), "navigate")
	px.applyIdentity(outReq.Header, req.Header, isNav)
	px.setOrder(outReq.Header, req.Header)
	outReq.ContentLength = req.ContentLength

	resp, err := px.upstream.RoundTrip(outReq, scheme, host, port)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	px.logf("%s %s -> %s", req.Method, target, resp.Status)

	// The browser leg is HTTP/1.1 regardless of what we negotiated upstream.
	resp.Proto, resp.ProtoMajor, resp.ProtoMinor = "HTTP/1.1", 1, 1
	for k := range resp.Header {
		if hopByHop[strings.ToLower(k)] {
			resp.Header.Del(k)
		}
	}
	return resp.Write(w)
}

// serveUpgrade handles WebSocket (and other Upgrade) requests by opening a
// dedicated HTTP/1.1 connection and splicing the two sockets once the server
// has accepted the upgrade.
func (px *Proxy) serveUpgrade(client net.Conn, br *bufio.Reader, req *stdhttp.Request, host, port string) error {
	server, err := px.upstream.DialUpgrade(host, port)
	if err != nil {
		return err
	}
	defer server.Close()

	outReq, err := http.NewRequest(req.Method, "https://"+req.Host+req.URL.RequestURI(), nil)
	if err != nil {
		return err
	}
	outReq.Header = http.Header{}
	for k, vs := range req.Header {
		outReq.Header[k] = append([]string(nil), vs...)
	}
	outReq.Header.Set("User-Agent", px.profile.UserAgent)
	if px.profile.AcceptLanguage != "" {
		outReq.Header.Set("Accept-Language", px.profile.AcceptLanguage)
	}
	px.setOrder(outReq.Header, req.Header)

	if err := outReq.Write(server); err != nil {
		return err
	}

	done := make(chan struct{}, 2)
	go func() { io.Copy(server, br); done <- struct{}{} }()
	go func() { io.Copy(client, server); done <- struct{}{} }()
	<-done
	return nil
}

func (px *Proxy) tlsConfigFor(host string) (*tls.Config, error) {
	px.tlsConfMu.Lock()
	defer px.tlsConfMu.Unlock()
	if c, ok := px.tlsConfs[host]; ok {
		return c, nil
	}
	cert, err := px.ca.For(host)
	if err != nil {
		return nil, err
	}
	conf := &tls.Config{
		Certificates: []tls.Certificate{*cert},
		// Only HTTP/1.1 is offered to the browser. The protocol on this leg is
		// invisible to the origin server, and h1 keeps request framing simple
		// enough to rewrite header order exactly.
		NextProtos: []string{"http/1.1"},
		MinVersion: tls.VersionTLS12,
	}
	px.tlsConfs[host] = conf
	return conf, nil
}

// handleConnect terminates the browser's TLS, then serves requests off it.
func (px *Proxy) handleConnect(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	host, port, err := net.SplitHostPort(r.Host)
	if err != nil {
		host, port = r.Host, "443"
	}

	hj, ok := w.(stdhttp.Hijacker)
	if !ok {
		stdhttp.Error(w, "hijack unsupported", stdhttp.StatusInternalServerError)
		return
	}
	client, _, err := hj.Hijack()
	if err != nil {
		return
	}
	defer client.Close()

	if _, err := client.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n")); err != nil {
		return
	}

	conf, err := px.tlsConfigFor(host)
	if err != nil {
		px.logf("cert for %s: %v", host, err)
		return
	}
	tlsConn := tls.Server(client, conf)
	if err := tlsConn.Handshake(); err != nil {
		px.logf("client handshake %s: %v", host, err)
		return
	}
	defer tlsConn.Close()

	br := bufio.NewReader(tlsConn)
	for {
		req, err := stdhttp.ReadRequest(br)
		if err != nil {
			return
		}
		req.URL.Scheme = "https"
		req.URL.Host = r.Host

		if strings.EqualFold(req.Header.Get("Upgrade"), "websocket") {
			if err := px.serveUpgrade(tlsConn, br, req, host, port); err != nil {
				px.logf("upgrade %s: %v", host, err)
			}
			return
		}

		if err := px.forward(tlsConn, req, "https", host, port); err != nil {
			px.logf("forward %s: %v", host, err)
			fmt.Fprintf(tlsConn, "HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
			return
		}
		if req.Close {
			return
		}
	}
}

func (px *Proxy) ServeHTTP(w stdhttp.ResponseWriter, r *stdhttp.Request) {
	if r.Method == stdhttp.MethodConnect {
		px.handleConnect(w, r)
		return
	}
	// Plain HTTP through the proxy. Rare for a browser today, but a redirect
	// chain can still start here.
	host, port := r.URL.Hostname(), r.URL.Port()
	if port == "" {
		port = "80"
	}
	hj, ok := w.(stdhttp.Hijacker)
	if !ok {
		stdhttp.Error(w, "hijack unsupported", stdhttp.StatusInternalServerError)
		return
	}
	conn, _, err := hj.Hijack()
	if err != nil {
		return
	}
	defer conn.Close()
	if err := px.forward(conn, r, "http", host, port); err != nil {
		px.logf("forward http %s: %v", host, err)
	}
}

func main() {
	var (
		profilePath = flag.String("profile", "", "path to the network profile JSON written by the Node side")
		listen      = flag.String("listen", "127.0.0.1:0", "address to listen on")
		caDir       = flag.String("ca-dir", "", "directory holding the local MITM CA (created if absent)")
		upstreamURL = flag.String("upstream", "", "upstream proxy, socks5://host:port or http://user:pass@host:port (overrides the profile)")
		printFP     = flag.Bool("print-fingerprint", false, "print the JA3/JA4 this profile produces and exit")
		fpHost      = flag.String("fingerprint-host", "www.example.com", "SNI to use when computing the fingerprint")
		verbose     = flag.Bool("verbose", false, "log every proxied request")
		readyFile   = flag.String("ready-file", "", "write the chosen listen address here once serving")
	)
	flag.Parse()

	if *profilePath == "" {
		log.Fatal("-profile is required")
	}
	p, err := LoadProfile(*profilePath)
	if err != nil {
		log.Fatal(err)
	}
	if *upstreamURL != "" {
		p.Upstream = *upstreamURL
	}

	if *printFP {
		ja3, ja3Hash, ja4, err := Fingerprint(p, *fpHost)
		if err != nil {
			log.Fatal(err)
		}
		fmt.Printf("device:    %s\n", p.DeviceID)
		fmt.Printf("template:  %s (Chrome %d)\n", p.TLS.UTLS, p.TLS.ChromeMajor)
		fmt.Printf("ja3:       %s\n", ja3Hash)
		fmt.Printf("ja3_text:  %s\n", ja3)
		fmt.Printf("ja4:       %s\n", ja4)
		fmt.Printf("\nNote: Chrome shuffles ClientHello extension order per connection,\n")
		fmt.Printf("so the JA3 hash above is one of many valid values for this profile.\n")
		fmt.Printf("JA4 sorts before hashing and is the stable one to assert on.\n")
		return
	}

	if *caDir == "" {
		log.Fatal("-ca-dir is required")
	}
	ca, err := LoadOrCreateCA(*caDir)
	if err != nil {
		log.Fatal(err)
	}
	up, err := NewUpstream(p)
	if err != nil {
		log.Fatal(err)
	}

	px := &Proxy{profile: p, ca: ca, upstream: up, verbose: *verbose, tlsConfs: map[string]*tls.Config{}}

	ln, err := net.Listen("tcp", *listen)
	if err != nil {
		log.Fatal(err)
	}
	addr := ln.Addr().String()
	if *readyFile != "" {
		if err := os.WriteFile(*readyFile, []byte(addr), 0o600); err != nil {
			log.Fatal(err)
		}
	}
	fmt.Printf("tlsproxy listening on %s (device %s, %s)\n", addr, p.DeviceID, p.TLS.UTLS)

	srv := &stdhttp.Server{Handler: px}
	log.Fatal(srv.Serve(ln))
}
