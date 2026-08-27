package main

import (
	"encoding/json"
	"fmt"
	"os"

	utls "github.com/bogdanfinn/utls"
)

// Profile is the network half of a device identity, written by the Node side
// (src/net/writeProfile.js) and read here. Keeping it a file rather than flags
// means the JS layer and the TLS layer cannot drift apart: one derivation, one
// artifact, two consumers.
type Profile struct {
	DeviceID  string `json:"deviceId"`
	UserAgent string `json:"userAgent"`

	AcceptLanguage string            `json:"acceptLanguage"`
	Accept         map[string]string `json:"accept"`
	ClientHints    map[string]string `json:"clientHints"`

	HeaderOrder struct {
		H2Pseudo    []string `json:"h2Pseudo"`
		Navigation  []string `json:"navigation"`
		XHR         []string `json:"xhr"`
		Subresource []string `json:"subresource"`
	} `json:"headerOrder"`

	TLS struct {
		UTLS        string `json:"utls"`
		ChromeMajor int    `json:"chromeMajor"`
	} `json:"tls"`

	// HTTP2 is the Akamai fingerprint: SETTINGS values and their order, the
	// initial connection-level WINDOW_UPDATE, and the pseudo-header order.
	// A correct ClientHello paired with Go's default SETTINGS is still a
	// non-Chrome client, which is why these are explicit.
	HTTP2 struct {
		Settings       map[string]uint32 `json:"settings"`
		SettingsOrder  []string          `json:"settingsOrder"`
		ConnectionFlow uint32            `json:"connectionFlow"`
		HeaderPriority *struct {
			Weight    uint8  `json:"weight"`
			StreamDep uint32 `json:"streamDep"`
			Exclusive bool   `json:"exclusive"`
		} `json:"headerPriority"`
	} `json:"http2"`

	Upstream string `json:"upstream"`
}

var clientHelloIDs = map[string]utls.ClientHelloID{
	"HelloChrome_120":  utls.HelloChrome_120,
	"HelloChrome_131":  utls.HelloChrome_131,
	"HelloChrome_133":  utls.HelloChrome_133,
	"HelloChrome_Auto": utls.HelloChrome_Auto,
}

var settingIDs = map[string]utlsSettingID{
	"HEADER_TABLE_SIZE":      1,
	"ENABLE_PUSH":            2,
	"MAX_CONCURRENT_STREAMS": 3,
	"INITIAL_WINDOW_SIZE":    4,
	"MAX_FRAME_SIZE":         5,
	"MAX_HEADER_LIST_SIZE":   6,
}

type utlsSettingID uint16

func LoadProfile(path string) (*Profile, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read profile: %w", err)
	}
	var p Profile
	if err := json.Unmarshal(raw, &p); err != nil {
		return nil, fmt.Errorf("parse profile: %w", err)
	}
	if _, ok := clientHelloIDs[p.TLS.UTLS]; !ok {
		return nil, fmt.Errorf("unknown uTLS profile %q", p.TLS.UTLS)
	}
	return &p, nil
}

func (p *Profile) HelloID() utls.ClientHelloID {
	return clientHelloIDs[p.TLS.UTLS]
}
