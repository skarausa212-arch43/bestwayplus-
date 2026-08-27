/**
 * The leftovers that give an emulation away: automation artifacts, the
 * `window.chrome` object, mobile-only globals, and WebRTC candidate handling.
 * Runs inside the page.
 */
export function patchMisc(cfg, nat) {
  const js = cfg.js;

  // ---- automation artifacts ----------------------------------------------
  // Cheap to remove, and each one is a single-property giveaway.
  const ARTIFACTS = [
    '__playwright_target__', '__pwInitScripts', '__pw_manual',
    '_Selenium_IDE_Recorder', '_selenium', 'callSelenium', '__webdriver_script_fn',
    '__driver_evaluate', '__webdriver_evaluate', '__selenium_evaluate',
    '__fxdriver_evaluate', '__driver_unwrapped', '__webdriver_unwrapped',
    '__selenium_unwrapped', '__fxdriver_unwrapped', '__nightmare', '_phantom',
    'callPhantom', 'domAutomation', 'domAutomationController',
  ];
  for (const k of ARTIFACTS) {
    try { delete window[k]; } catch (e) { /* ignore */ }
  }
  // ChromeDriver stamps a `$cdc_*` property onto document.
  try {
    for (const k of Object.getOwnPropertyNames(document)) {
      if (/^\$?cdc_|^\$wdc_/.test(k)) delete document[k];
    }
  } catch (e) { /* ignore */ }

  // ---- window.chrome ------------------------------------------------------
  // Present on Android Chrome with `app`, `csi` and `loadTimes`, and *without*
  // `runtime` (that only appears for extension pages, which Android has none of).
  try {
    const chrome = window.chrome && typeof window.chrome === 'object'
      ? window.chrome
      : {};
    if (!window.chrome) nat.defineValue(window, 'chrome', chrome);

    if (typeof chrome.csi !== 'function') {
      chrome.csi = nat.markNative(function csi() {
        const t = performance.timing;
        return {
          onloadT: t.domContentLoadedEventEnd,
          startE: t.navigationStart,
          pageT: performance.now(),
          tran: 15,
        };
      }, 'csi');
    }
    if (typeof chrome.loadTimes !== 'function') {
      chrome.loadTimes = nat.markNative(function loadTimes() {
        const n = performance.getEntriesByType('navigation')[0] || {};
        const base = performance.timeOrigin / 1000;
        return {
          requestTime: base,
          startLoadTime: base,
          commitLoadTime: base + (n.responseStart || 0) / 1000,
          finishDocumentLoadTime: base + (n.domContentLoadedEventEnd || 0) / 1000,
          finishLoadTime: base + (n.loadEventEnd || 0) / 1000,
          firstPaintTime: base + (n.responseEnd || 0) / 1000,
          firstPaintAfterLoadTime: 0,
          navigationType: 'Other',
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true,
          npnNegotiatedProtocol: 'h2',
          wasAlternateProtocolAvailable: false,
          connectionInfo: 'h2',
        };
      }, 'loadTimes');
    }
    if (!chrome.app) {
      chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: nat.markNative(function getDetails() { return null; }, 'getDetails'),
        getIsInstalled: nat.markNative(function getIsInstalled() { return false; }, 'getIsInstalled'),
      };
    }
    // `chrome.runtime` on a plain page is a desktop-extension artifact.
    try { delete chrome.runtime; } catch (e) { /* ignore */ }
  } catch (e) { /* ignore */ }

  // ---- mobile-only globals ------------------------------------------------
  // window.orientation is deprecated but still present on Android and absent on
  // desktop, which makes its absence a clean contradiction of a mobile UA.
  try {
    if (!('orientation' in window)) {
      nat.defineGetter(window, 'orientation', () =>
        js.screen.orientation.type.startsWith('portrait') ? 0 : 90
      );
    }
    if (!('onorientationchange' in window)) {
      nat.defineValue(window, 'onorientationchange', null);
    }
    for (const h of ['ondevicemotion', 'ondeviceorientation', 'ondeviceorientationabsolute']) {
      if (!(h in window)) nat.defineValue(window, h, null);
    }
  } catch (e) { /* ignore */ }

  // navigator.standalone is iOS-only; its presence would contradict Android.
  try { delete Navigator.prototype.standalone; } catch (e) { /* ignore */ }
  // DeviceMotionEvent.requestPermission is iOS-only too.
  try {
    if (window.DeviceMotionEvent) delete DeviceMotionEvent.requestPermission;
    if (window.DeviceOrientationEvent) delete DeviceOrientationEvent.requestPermission;
  } catch (e) { /* ignore */ }

  // ---- WebRTC -------------------------------------------------------------
  // Preferred handling is the launch flag (see src/session.js), which keeps
  // WebRTC from ever gathering an off-proxy candidate — no JS trace at all.
  // This rewrite is the belt-and-braces half: strip private host candidates and
  // pin the reflexive address to the egress IP, so a leak test sees exactly the
  // address the HTTP traffic comes from.
  const publicIp = js.webrtcPublicIp;
  if (publicIp && window.RTCPeerConnection) {
    const PRIVATE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.|::1|fe80:|fc00:|fd)/i;

    function rewriteSdp(sdp) {
      if (typeof sdp !== 'string') return sdp;
      return sdp
        .split('\r\n')
        .filter((line) => {
          if (!line.startsWith('a=candidate:')) return true;
          const m = /^a=candidate:\S+ \d+ \S+ \d+ (\S+) /.exec(line);
          return !(m && (PRIVATE.test(m[1]) || m[1].endsWith('.local')));
        })
        .map((line) =>
          line.startsWith('a=candidate:')
            ? line.replace(/raddr \S+/, `raddr ${publicIp}`)
            : line
        )
        .join('\r\n');
    }

    try {
      const R = RTCPeerConnection.prototype;
      for (const method of ['createOffer', 'createAnswer']) {
        nat.replaceMethod(R, method, (orig) => function (...args) {
          return orig.apply(this, args).then((desc) => {
            try {
              return { type: desc.type, sdp: rewriteSdp(desc.sdp) };
            } catch (e) {
              return desc;
            }
          });
        });
      }
      nat.replaceMethod(R, 'addIceCandidate', (orig) => function addIceCandidate(cand, ...rest) {
        try {
          if (cand && typeof cand.candidate === 'string') {
            const m = /^candidate:\S+ \d+ \S+ \d+ (\S+) /.exec(cand.candidate);
            if (m && (PRIVATE.test(m[1]) || m[1].endsWith('.local'))) {
              return Promise.resolve();
            }
          }
        } catch (e) { /* ignore */ }
        return orig.call(this, cand, ...rest);
      });
    } catch (e) { /* ignore */ }
  }

  // ---- timing -------------------------------------------------------------
  // Chrome clamps performance.now() to 100 microseconds for non-isolated
  // contexts. A higher-resolution clock is both a Chromium-flag tell and a
  // timing side channel for "is this machine unusually fast for a phone".
  try {
    nat.replaceMethod(Performance.prototype, 'now', (orig) => function now() {
      return Math.floor(orig.call(this) * 10) / 10;
    });
  } catch (e) { /* ignore */ }
}
