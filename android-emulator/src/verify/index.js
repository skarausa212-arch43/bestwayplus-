import { createServer } from 'node:http';
import { launchDevice } from '../session.js';
import { collectFingerprint } from './collect.js';

/**
 * Verification exists because an emulator you have not measured is an emulator
 * that silently stopped working three Chromium releases ago. Every check below
 * either compares an observed value to the profile that generated it, or asserts
 * an internal consistency rule a real device cannot violate.
 */

const PASS = 'pass';
const FAIL = 'fail';
const WARN = 'warn';

function eq(name, actual, expected, note) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  return { name, status: ok ? PASS : FAIL, actual, expected, note };
}

function assert(name, ok, actual, note, level = FAIL) {
  return { name, status: ok ? PASS : level, actual, expected: note, note };
}

/** Serves one blank page so the collector runs on a real http origin rather
 *  than about:blank, where several APIs behave differently. */
async function withLocalOrigin(fn) {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    // The viewport meta tag matters: without it a mobile browser lays the page
    // out at its 980px legacy width, and innerWidth stops resembling the
    // screen. That is correct behaviour, but it would make the geometry checks
    // below measure the missing tag rather than the emulation.
    res.end(
      '<!doctype html><meta charset="utf-8">' +
        '<meta name="viewport" content="width=device-width, initial-scale=1">' +
        '<title>emulation check</title><body>'
    );
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    return await fn(url);
  } finally {
    server.close();
  }
}

export function buildChecks(profile, fp, options = {}) {
  const js = profile.js;
  const checks = [];
  const n = fp.navigator || {};
  const s = fp.screen || {};
  const gl = fp.webgl || {};
  const ud = fp.uaData || {};
  const surface = fp.surface || {};
  const integrity = fp.integrity || {};

  // ---- identity ----------------------------------------------------------
  checks.push(eq('navigator.userAgent', n.userAgent, js.userAgent));
  checks.push(eq('navigator.platform', n.platform, js.platform));
  checks.push(eq('navigator.vendor', n.vendor, js.vendor));
  checks.push(eq('navigator.hardwareConcurrency', n.hardwareConcurrency, js.hardwareConcurrency));
  checks.push(eq('navigator.deviceMemory', n.deviceMemory, js.deviceMemory));
  checks.push(eq('navigator.maxTouchPoints', n.maxTouchPoints, js.maxTouchPoints));
  checks.push(eq('navigator.languages', n.languages, js.languages));
  checks.push(assert('navigator.webdriver is false', n.webdriver === false, n.webdriver));
  checks.push(assert('navigator.plugins is empty (Android)', n.pluginCount === 0, n.pluginCount));
  checks.push(assert('navigator.pdfViewerEnabled is false', n.pdfViewerEnabled === false, n.pdfViewerEnabled));

  checks.push(assert(
    'UA string is the reduced Android form',
    /Android 10; K\)/.test(n.userAgent || ''),
    n.userAgent,
    'Chrome 110+ freezes the Android UA to "Android 10; K"; a real model here is the tell'
  ));

  // ---- client hints ------------------------------------------------------
  checks.push(eq('userAgentData.model', ud.model, js.uaData.model));
  checks.push(eq('userAgentData.platformVersion', ud.platformVersion, js.uaData.platformVersion));
  checks.push(eq('userAgentData.platform', ud.platform, js.uaData.platform));
  checks.push(eq('userAgentData.mobile', ud.mobile, js.uaData.mobile));
  checks.push(eq('userAgentData.uaFullVersion', ud.uaFullVersion, js.uaData.uaFullVersion));
  checks.push(assert(
    'userAgentData.architecture is empty (Android)',
    ud.architecture === '',
    ud.architecture
  ));
  checks.push(assert(
    'Sec-CH-UA brands agree with the UA major version',
    (ud.brands || []).some((b) => b.version === String(profile.device.browser.major)),
    ud.brands
  ));

  // ---- screen ------------------------------------------------------------
  checks.push(eq('screen.width', s.width, js.screen.width));
  checks.push(eq('screen.height', s.height, js.screen.height));
  checks.push(eq('devicePixelRatio', s.devicePixelRatio, js.screen.dpr));
  checks.push(eq('screen.colorDepth', s.colorDepth, js.screen.colorDepth));
  checks.push(assert(
    'viewport fits inside the screen',
    s.innerWidth <= s.width && s.innerHeight <= s.height,
    { inner: [s.innerWidth, s.innerHeight], screen: [s.width, s.height] }
  ));
  checks.push(assert(
    'CSS size x DPR matches the physical panel',
    Math.abs(Math.round(js.screen.width * js.screen.dpr) - profile.device.panel.w) <= 2 &&
      Math.abs(Math.round(js.screen.height * js.screen.dpr) - profile.device.panel.h) <= 2,
    {
      computed: [
        Math.round(js.screen.width * js.screen.dpr),
        Math.round(js.screen.height * js.screen.dpr),
      ],
      panel: [profile.device.panel.w, profile.device.panel.h],
    }
  ));
  checks.push(assert('window.orientation exists (mobile only)', fp.screen?.windowOrientation === 'number', fp.screen?.windowOrientation));
  checks.push(assert('pointer is coarse', fp.media?.pointerCoarse === true, fp.media?.pointerCoarse));
  checks.push(assert('hover is unavailable', fp.media?.hoverNone === true, fp.media?.hoverNone));
  checks.push(assert('ontouchstart present', fp.media?.touchStart === true, fp.media?.touchStart));

  // ---- locale ------------------------------------------------------------
  checks.push(eq('Intl timezone', fp.intl?.timezone, js.timezone));

  // ---- WebGL -------------------------------------------------------------
  checks.push(eq('WebGL UNMASKED_VENDOR', gl.unmaskedVendor, js.webgl.unmaskedVendor));
  checks.push(eq('WebGL UNMASKED_RENDERER', gl.unmaskedRenderer, js.webgl.unmaskedRenderer));
  checks.push(eq('WebGL VENDOR', gl.vendor, js.webgl.vendor));
  checks.push(eq('WebGL MAX_TEXTURE_SIZE', gl.maxTextureSize, js.webgl.limits.MAX_TEXTURE_SIZE));
  checks.push(eq('WebGL MAX_VIEWPORT_DIMS', gl.maxViewportDims, js.webgl.limits.MAX_VIEWPORT_DIMS));
  checks.push(eq('WebGL MAX_VARYING_VECTORS', gl.maxVaryingVectors, js.webgl.limits.MAX_VARYING_VECTORS));
  checks.push(eq('WebGL extension count', gl.extensionCount, js.webgl.extensions.length));
  checks.push(assert(
    'mobile GLES medium-float precision',
    JSON.stringify(gl.highFloat) === JSON.stringify([15, 15, 10]),
    gl.highFloat,
    'desktop GL reports [127,127,23] for medium float'
  ));

  // ---- canvas / audio stability -----------------------------------------
  checks.push(assert(
    'canvas toDataURL is stable within the session',
    fp.canvas?.dataUrlStable === true,
    fp.canvas?.dataUrlStable,
    'unstable canvas hashes are more detectable than any single hash'
  ));
  checks.push(assert('canvas getImageData is stable', fp.canvas?.imageDataStable === true, fp.canvas?.imageDataStable));
  checks.push(assert('TextMetrics is stable', fp.textMetrics?.stable === true, fp.textMetrics?.stable));
  checks.push(assert('audio render is stable', fp.audio?.stable === true, fp.audio?.stable));
  checks.push(assert(
    'AudioContext runs at 48 kHz (Android HAL)',
    fp.audio?.sampleRate === 48000,
    fp.audio?.sampleRate
  ));

  // ---- fonts -------------------------------------------------------------
  // Canvas probes are the JS layer's responsibility and must be exact. DOM
  // probes are the real font set's responsibility, so they are only enforced
  // when a font directory was supplied; otherwise they report what leaks.
  const fonts = fp.fonts || { canvas: {}, dom: {}, desktopFaces: [], androidFaces: [] };
  // Whether the font set was *actually* constrained, not merely requested:
  // Chromium reads fontconfig only on Linux, so on macOS and Windows a
  // fontsDir is accepted and has no effect. Enforcing these as failures there
  // would report a platform limit as a bug in the profile.
  const fontsConstrained = !!options.fontsActive;
  const fontsNote = options.fontsReason || 'font set not constrained';

  for (const face of fonts.desktopFaces || []) {
    checks.push(assert(
      `canvas cannot detect desktop face "${face}"`,
      fonts.canvas[face] === false,
      fonts.canvas[face]
    ));
  }
  const leakedDom = (fonts.desktopFaces || []).filter((f) => fonts.dom[f] === true);
  checks.push(assert(
    'DOM measurement cannot detect desktop faces',
    leakedDom.length === 0,
    leakedDom,
    fontsConstrained
      ? 'the font directory still contains non-Android faces'
      : fontsNote,
    fontsConstrained ? FAIL : WARN
  ));
  const missingAndroid = (fonts.androidFaces || []).filter((f) => fonts.dom[f] !== true);
  checks.push(assert(
    'Android faces are actually present',
    missingAndroid.length === 0,
    missingAndroid,
    fontsConstrained
      ? 'the font directory is missing faces the profile claims'
      : fontsNote,
    fontsConstrained ? FAIL : WARN
  ));
  checks.push(assert('queryLocalFonts absent (Android)', fonts.queryLocalFonts === 'undefined', fonts.queryLocalFonts));

  // ---- API surface -------------------------------------------------------
  checks.push(assert('navigator.serial absent', surface.serial === false, surface.serial));
  checks.push(assert('navigator.hid absent', surface.hid === false, surface.hid));
  checks.push(assert('navigator.keyboard absent', surface.keyboard === false, surface.keyboard));
  checks.push(assert('SharedWorker absent', surface.sharedWorker === false, surface.sharedWorker));
  checks.push(assert('showOpenFilePicker absent', surface.showOpenFilePicker === false, surface.showOpenFilePicker));
  checks.push(assert('navigator.standalone absent (not iOS)', surface.standalone === false, surface.standalone));
  checks.push(assert('window.chrome present', surface.chromeObject === 'object', surface.chromeObject));
  checks.push(assert('chrome.loadTimes present', surface.chromeLoadTimes === true, surface.chromeLoadTimes));
  checks.push(assert('speechSynthesis has voices', surface.speechVoiceCount > 0, surface.speechVoiceCount));
  checks.push(assert(
    'Notification.permission and permissions.query agree',
    surface.notificationPermission === 'default' && fp.permissions?.notifications === 'prompt',
    { notification: surface.notificationPermission, query: fp.permissions?.notifications },
    'headless Chrome reports denied/prompt — a classic mismatch'
  ));
  checks.push(assert(
    'enumerateDevices lists no audiooutput (Android)',
    Array.isArray(fp.devices) && !fp.devices.includes('audiooutput'),
    fp.devices
  ));
  checks.push(eq('AV1 support matches the profile',
    fp.codecs?.av1,
    js.codecs['video/mp4; codecs="av01.0.05M.08"'] || ''));

  // ---- patch integrity ---------------------------------------------------
  checks.push(assert(
    'userAgent is a prototype accessor, not an own property',
    integrity.uaIsOwnProperty === false,
    integrity.uaIsOwnProperty
  ));
  checks.push(assert(
    'patched getter reports native source',
    /\[native code\]/.test(integrity.uaGetterSource || ''),
    integrity.uaGetterSource
  ));
  checks.push(assert(
    'patched getter keeps its name',
    integrity.uaGetterName === 'get userAgent',
    integrity.uaGetterName
  ));
  checks.push(assert(
    'Function.prototype.toString reports native source',
    /\[native code\]/.test(integrity.toStringSource || ''),
    integrity.toStringSource,
    'the most common single probe for a patched environment'
  ));
  checks.push(assert(
    'patched getImageData reports native source',
    /\[native code\]/.test(integrity.getImageDataSource || ''),
    integrity.getImageDataSource
  ));
  checks.push(assert(
    'no automation framework appears in error stacks',
    integrity.automationInStack === false,
    integrity.patchedStack
  ));
  // Known residual leak, reported rather than hidden: a JS replacement for a
  // native method contributes a stack frame that the native original does not.
  // Closing it means overriding Error.prepareStackTrace, whose mere presence is
  // itself anomalous — a worse trade than the frame it would remove.
  checks.push(assert(
    'patched natives leave no JS frame in stack traces',
    !/getImageData \(/.test(integrity.patchedStack || ''),
    integrity.patchedStack,
    'inherent to patch-based emulation; see docs/limitations.md',
    WARN
  ));

  if (fp.errors?.length) {
    checks.push({ name: 'collector errors', status: WARN, actual: fp.errors, expected: [] });
  }

  return checks;
}

/**
 * Verifies a session that is already running.
 *
 * The collector gets its own page on a real http origin, and that is not a
 * convenience: on `about:blank` there is no secure context, so
 * `navigator.userAgentData` and `navigator.mediaDevices` are simply absent, and
 * with no viewport meta the layout falls back to 980px. Checking there reports
 * nine failures against an emulation that is working perfectly — a wrong answer
 * delivered confidently, which is worse than no answer.
 *
 * The page is temporary so a caller mirroring the session (the control panel)
 * keeps whatever the user was looking at.
 */
export async function verifyInSession(session, options = {}) {
  return withLocalOrigin(async (url) => {
    const page = await session.newPage();
    try {
      await page.goto(url, { waitUntil: 'load' });
      // getVoices() populates asynchronously on first call in some builds.
      await page.waitForTimeout(150);
      const fp = await page.evaluate(collectFingerprint);
      return {
        profile: session.profile,
        fingerprint: fp,
        checks: buildChecks(session.profile, fp, {
          ...options,
          fontsActive: session.fonts.active,
          fontsReason: session.fonts.reason,
        }),
      };
    } finally {
      await page.close().catch(() => {});
    }
  });
}

export async function verifyDevice(options = {}) {
  const session = await launchDevice(options);
  try {
    return await verifyInSession(session, options);
  } finally {
    await session.close();
  }
}

export function summarize(checks) {
  return {
    pass: checks.filter((c) => c.status === PASS).length,
    warn: checks.filter((c) => c.status === WARN).length,
    fail: checks.filter((c) => c.status === FAIL).length,
    total: checks.length,
  };
}
