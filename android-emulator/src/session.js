import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { deriveProfile } from './profile/derive.js';
import { buildInitScript } from './inject/index.js';
import { writeNetworkProfile } from './net/profile.js';
import { TlsProxy } from './net/tlsproxy.js';
import { fontconfigEnv } from './net/fonts.js';

/**
 * One emulated device = one browser process + one TLS proxy + one on-disk
 * profile directory. The directory holds the cookie jar, localStorage,
 * IndexedDB and the local CA, so a device that "came back tomorrow" carries the
 * same state it had — which is what a real returning handset looks like, and
 * what a freshly minted context conspicuously does not.
 */
export class DeviceSession {
  constructor(profile, { context, proxy, dir }) {
    this.profile = profile;
    this.context = context;
    this.proxy = proxy;
    this.dir = dir;
  }

  get pages() {
    return this.context.pages();
  }

  async newPage() {
    return this.context.newPage();
  }

  async close() {
    try {
      await this.context.close();
    } finally {
      await this.proxy.stop();
    }
  }
}

/**
 * CDP-level identity. This is stronger than the JS patch for the values it
 * covers: Chromium computes navigator.userAgentData, the Sec-CH-UA request
 * headers and the UA string itself from this metadata, so they cannot disagree
 * with each other the way three independent patches eventually would. The JS
 * layer still runs, deriving from the same profile, and covers what CDP does
 * not reach.
 */
async function applyUserAgentMetadata(page, profile) {
  const ud = profile.js.uaData;
  const metadata = {
    brands: ud.brands,
    fullVersionList: ud.fullVersionList,
    fullVersion: ud.uaFullVersion,
    platform: ud.platform,
    platformVersion: ud.platformVersion,
    architecture: ud.architecture,
    model: ud.model,
    mobile: ud.mobile,
    bitness: ud.bitness,
    wow64: ud.wow64,
    formFactors: ud.formFactors,
  };
  const payload = {
    userAgent: profile.js.userAgent,
    acceptLanguage: profile.js.languages.join(','),
    platform: profile.js.platform,
    userAgentMetadata: metadata,
  };

  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setUserAgentOverride', payload);
  } catch (err) {
    // formFactors is newer than some Chromium builds; retry without it rather
    // than losing the whole override.
    delete payload.userAgentMetadata.formFactors;
    await cdp.send('Emulation.setUserAgentOverride', payload);
  } finally {
    await cdp.detach().catch(() => {});
  }
}

export async function launchDevice(options = {}) {
  const {
    deviceId,
    locale = 'en-US',
    seed = 'default-seed',
    timezone,
    upstream = '',
    publicIp = null,
    headless = true,
    profilesDir = './profiles-data',
    fontsDir = null,
    verbose = false,
    launchOptions = {},
  } = options;

  const profile = deriveProfile({ deviceId, locale, seed, timezone, proxy: upstream });

  const dir = resolve(join(profilesDir, `${profile.deviceId}-${profile.seedId}`));
  const userDataDir = join(dir, 'chromium');
  await mkdir(userDataDir, { recursive: true });

  // ---- network identity ---------------------------------------------------
  const networkProfilePath = join(dir, 'network.json');
  await writeNetworkProfile(profile, networkProfilePath, { upstream });

  const proxy = new TlsProxy({
    profilePath: networkProfilePath,
    caDir: join(dir, 'ca'),
    upstream,
    verbose,
  });
  await proxy.start();

  // ---- browser ------------------------------------------------------------
  const args = [
    // Trust exactly the proxy's CA, and nothing else. Broader flags such as
    // --ignore-certificate-errors would also hide genuine upstream TLS
    // failures, which the real device would have seen.
    `--ignore-certificate-errors-spki-list=${proxy.spki}`,
    // Keep WebRTC from opening a UDP path around the proxy. Without this the
    // page can learn the host's real address while every HTTP request says
    // otherwise — the single most common way a proxied browser is unmasked.
    '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
    // navigator.webdriver, removed at the source rather than patched over.
    '--disable-blink-features=AutomationControlled',
    ...(launchOptions.args || []),
  ];

  // Chromium refuses to start its sandbox as uid 0. Containers commonly run as
  // root, and the alternative — silently failing to launch — is worse than
  // dropping a sandbox that has nothing to protect in a throwaway container.
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    args.push('--no-sandbox');
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless,
    args,
    // Set ANDRO_CHROMIUM_PATH when Playwright's bundled browser is not the one
    // that should run (a preinstalled Chromium, a different channel).
    ...(process.env.ANDRO_CHROMIUM_PATH
      ? { executablePath: process.env.ANDRO_CHROMIUM_PATH }
      : {}),
    ignoreDefaultArgs: ['--enable-automation'],
    proxy: {
      server: proxy.proxyUrl,
      // Loopback never leaves the machine, so routing it through the emulated
      // device's egress would be meaningless — and it is how the local
      // verification origin stays reachable.
      bypass: 'localhost,127.0.0.1,::1',
    },
    env: { ...process.env, ...fontconfigEnv(profile, { fontsDir, dir }) },

    userAgent: profile.js.userAgent,
    viewport: profile.launch.viewport,
    screen: { width: profile.js.screen.width, height: profile.js.screen.height },
    deviceScaleFactor: profile.launch.deviceScaleFactor,
    isMobile: profile.launch.isMobile,
    hasTouch: profile.launch.hasTouch,
    locale: profile.launch.locale,
    timezoneId: profile.launch.timezoneId,
    colorScheme: 'light',
    ...launchOptions.contextOptions,
  });

  await context.addInitScript({
    content: buildInitScript(profile, { publicIp, debug: verbose }),
  });

  // Pages created before now (the persistent context opens one) need the CDP
  // override too; later ones get it from the event.
  context.on('page', (page) => {
    applyUserAgentMetadata(page, profile).catch(() => {});
  });
  for (const page of context.pages()) {
    await applyUserAgentMetadata(page, profile);
  }

  return new DeviceSession(profile, { context, proxy, dir });
}
