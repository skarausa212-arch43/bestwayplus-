import { getDevice, CHROMIUM_WEBGL } from '../../profiles/devices.js';
import { getLocale, resolveTlsProfile, HEADER_ORDER, ACCEPT } from '../../profiles/network.js';
import { fnv1a, rngFor, seedId, randInt } from './prng.js';

/**
 * Turns (device id, locale, seed) into one fully resolved identity that the JS
 * injector, the header writer and the TLS proxy all read from. Anything a site
 * can observe should be decided here, once — the moment two layers compute the
 * same value independently they will eventually disagree.
 */

/**
 * Chrome's `Sec-CH-UA` brand list, including the GREASE ("Not A Brand") entry.
 * Chromium permutes the brand order and mangles the fake brand's spelling per
 * milestone, so these are transcribed from real browsers rather than generated.
 * Update from a real device when adding a milestone — a plausible-looking guess
 * here is worse than refusing the version.
 */
const UA_BRANDS = {
  120: [
    { brand: 'Not_A Brand', version: '8' },
    { brand: 'Chromium', version: '120' },
    { brand: 'Google Chrome', version: '120' },
  ],
  131: [
    { brand: 'Google Chrome', version: '131' },
    { brand: 'Chromium', version: '131' },
    { brand: 'Not_A Brand', version: '24' },
  ],
  133: [
    { brand: 'Not(A:Brand', version: '99' },
    { brand: 'Google Chrome', version: '133' },
    { brand: 'Chromium', version: '133' },
  ],
};

/** Chrome only ever reports these values for navigator.deviceMemory. */
const DEVICE_MEMORY_BUCKETS = [0.25, 0.5, 1, 2, 4, 8];

function quantizeDeviceMemory(gb) {
  // Chrome clamps to 8 GiB max and rounds down to the nearest bucket, so a
  // 12 GiB phone reports 8 — reporting 12 would be impossible.
  let best = DEVICE_MEMORY_BUCKETS[0];
  for (const b of DEVICE_MEMORY_BUCKETS) if (b <= gb) best = b;
  return best;
}

function brandsFor(major) {
  const b = UA_BRANDS[major];
  if (!b) {
    throw new Error(
      `No transcribed Sec-CH-UA brand list for Chrome ${major}. ` +
        `Add one from a real browser in src/profile/derive.js (UA_BRANDS).`
    );
  }
  return b;
}

/**
 * Since Chrome 110 the Android UA string is frozen: the real OS version and
 * model are replaced by "Android 10; K" for every device. Emitting the true
 * model here — the intuitive thing to do — is itself a tell, because no real
 * Chrome 110+ does it. The real values travel in high-entropy client hints.
 */
function buildUserAgent(device) {
  const mobileToken = device.formFactor === 'mobile' ? ' Mobile' : '';
  return (
    `Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 ` +
    `(KHTML, like Gecko) Chrome/${device.browser.major}.0.0.0${mobileToken} Safari/537.36`
  );
}

/**
 * Network Information API. Chrome quantizes both values hard to limit their
 * fingerprinting value: rtt to a 25 ms grid, downlink to 0.025 Mbit steps
 * capped at 10. Reporting un-quantized numbers is a giveaway.
 */
function deriveConnection(rng) {
  const rtt = randInt(rng, 2, 6) * 25; // 50..150 ms, on-grid
  const downlink = Math.min(10, Math.round(randInt(rng, 40, 400) / 25) * 0.25);
  return { effectiveType: '4g', type: 'cellular', rtt, downlink, saveData: false };
}

/**
 * Viewport = panel minus the browser's own chrome. Chrome/Android reserves the
 * status bar plus the top toolbar; the toolbar collapses on scroll, which is
 * why innerHeight and screen.height legitimately differ on a real device.
 */
function deriveViewport(device) {
  const reserved = device.formFactor === 'tablet' ? 96 : 80;
  return {
    width: device.screen.width,
    height: Math.max(320, device.screen.height - reserved),
  };
}

export function deriveProfile(options = {}) {
  const {
    deviceId,
    locale: localeTag = 'en-US',
    seed = 'default-seed',
    timezone: timezoneOverride,
    proxy = null,
    battery: batteryOverride,
  } = options;

  if (!deviceId) throw new Error('deriveProfile: deviceId is required');

  const device = getDevice(deviceId);
  const locale = getLocale(localeTag);
  const tls = resolveTlsProfile(device.browser.major);
  const timezone = timezoneOverride || locale.timezone;

  const seedNum = typeof seed === 'number' ? seed : fnv1a(String(seed));
  const rng = rngFor(seedNum, 'profile');

  const ua = buildUserAgent(device);
  const brands = brandsFor(device.browser.major);
  const fullVersionList = brands.map((b) =>
    b.brand === 'Not_A Brand' || b.brand === 'Not(A:Brand'
      ? { brand: b.brand, version: `${b.version}.0.0.0` }
      : { brand: b.brand, version: device.browser.full }
  );

  const secChUa = brands.map((b) => `"${b.brand}";v="${b.version}"`).join(', ');
  const secChUaFullVersionList = fullVersionList
    .map((b) => `"${b.brand}";v="${b.version}"`)
    .join(', ');

  const battery = {
    charging: batteryOverride?.charging ?? device.battery.charging,
    // Chrome rounds level to 2 decimals; seed-jitter it so two sessions on the
    // same device model are not bit-identical.
    level:
      batteryOverride?.level ??
      Math.min(1, Math.max(0.05,
        Math.round((device.battery.level + (rng() - 0.5) * 0.1) * 100) / 100)),
  };

  const viewport = deriveViewport(device);

  return {
    // ---- identity -------------------------------------------------------
    seed: seedNum,
    seedId: seedId(seedNum),
    deviceId: device.id,
    deviceName: device.name,
    formFactor: device.formFactor,

    // ---- what the page's JS sees ---------------------------------------
    js: {
      userAgent: ua,
      appVersion: ua.replace(/^Mozilla\//, ''),
      platform: 'Linux armv8l',
      vendor: 'Google Inc.',
      vendorSub: '',
      product: 'Gecko',
      productSub: '20030107',
      oscpu: undefined,
      hardwareConcurrency: device.hardware.cores,
      deviceMemory: quantizeDeviceMemory(device.hardware.memoryGB),
      maxTouchPoints: device.hardware.touchPoints,
      pdfViewerEnabled: false, // Android Chrome has no built-in PDF viewer
      languages: locale.languages,
      language: locale.languages[0],
      timezone,
      connection: deriveConnection(rngFor(seedNum, 'connection')),
      battery,

      uaData: {
        mobile: device.formFactor === 'mobile',
        platform: 'Android',
        brands,
        fullVersionList,
        // Chrome/Android reports these two as empty strings, not "arm"/"64".
        architecture: '',
        bitness: '',
        model: device.model,
        platformVersion: `${device.android.version}.0.0`,
        uaFullVersion: device.browser.full,
        wow64: false,
        formFactors: [device.formFactor === 'tablet' ? 'Tablet' : 'Mobile'],
      },

      screen: {
        width: device.screen.width,
        height: device.screen.height,
        // Android reports no reserved OS strip in screen.avail*.
        availWidth: device.screen.width,
        availHeight: device.screen.height,
        availLeft: 0,
        availTop: 0,
        colorDepth: device.screen.colorDepth,
        pixelDepth: device.screen.colorDepth,
        dpr: device.screen.dpr,
        orientation: {
          type: device.formFactor === 'tablet' ? 'landscape-primary' : 'portrait-primary',
          angle: 0,
        },
      },

      webgl: {
        ...CHROMIUM_WEBGL,
        unmaskedVendor: device.gpu.unmaskedVendor,
        unmaskedRenderer: device.gpu.unmaskedRenderer,
        extensions: device.gpu.extensions,
        limits: device.gpu.limits,
      },

      canvas: { seed: fnv1a(`${seedNum}:canvas:${device.id}`) },
      audio: { ...device.audio, seed: fnv1a(`${seedNum}:audio:${device.id}`) },
      fonts: device.fonts,
      codecs: device.codecs,
    },

    // ---- what the network sees -----------------------------------------
    net: {
      userAgent: ua,
      acceptLanguage: locale.acceptLanguage,
      accept: ACCEPT,
      headerOrder: HEADER_ORDER,
      clientHints: {
        'sec-ch-ua': secChUa,
        'sec-ch-ua-mobile': device.formFactor === 'mobile' ? '?1' : '?0',
        'sec-ch-ua-platform': '"Android"',
        'sec-ch-ua-platform-version': `"${device.android.version}.0.0"`,
        'sec-ch-ua-model': `"${device.model}"`,
        'sec-ch-ua-full-version': `"${device.browser.full}"`,
        'sec-ch-ua-full-version-list': secChUaFullVersionList,
        'sec-ch-ua-arch': '""',
        'sec-ch-ua-bitness': '""',
        'sec-ch-ua-wow64': '?0',
        'sec-ch-ua-form-factors':
          device.formFactor === 'tablet' ? '"Tablet"' : '"Mobile"',
      },
      tls,
      proxy,
      expectedCountry: locale.country,
      timezone,
    },

    // ---- browser launch --------------------------------------------------
    launch: {
      viewport,
      deviceScaleFactor: device.screen.dpr,
      isMobile: true,
      hasTouch: true,
      locale: locale.tag,
      timezoneId: timezone,
    },

    device,
    locale,
  };
}
