/**
 * navigator, NavigatorUAData, and the API-surface differences between desktop
 * Chrome (what Playwright actually runs) and Chrome on Android (what we claim
 * to be). Runs inside the page.
 */
export function patchNavigator(cfg, nat) {
  const js = cfg.js;
  const N = Navigator.prototype;

  // ---- scalar identity ---------------------------------------------------
  nat.defineGetter(N, 'userAgent', () => js.userAgent);
  nat.defineGetter(N, 'appVersion', () => js.appVersion);
  nat.defineGetter(N, 'platform', () => js.platform);
  nat.defineGetter(N, 'vendor', () => js.vendor);
  nat.defineGetter(N, 'vendorSub', () => js.vendorSub);
  nat.defineGetter(N, 'product', () => js.product);
  nat.defineGetter(N, 'productSub', () => js.productSub);
  nat.defineGetter(N, 'appName', () => 'Netscape');
  nat.defineGetter(N, 'appCodeName', () => 'Mozilla');
  nat.defineGetter(N, 'hardwareConcurrency', () => js.hardwareConcurrency);
  nat.defineGetter(N, 'deviceMemory', () => js.deviceMemory);
  nat.defineGetter(N, 'maxTouchPoints', () => js.maxTouchPoints);
  nat.defineGetter(N, 'pdfViewerEnabled', () => js.pdfViewerEnabled);
  nat.defineGetter(N, 'doNotTrack', () => null);
  nat.defineGetter(N, 'webdriver', () => false);
  nat.defineGetter(N, 'language', () => js.language);
  nat.defineGetter(N, 'languages', () => Object.freeze(js.languages.slice()));
  nat.defineGetter(N, 'onLine', () => true);
  nat.defineGetter(N, 'cookieEnabled', () => true);

  // ---- navigator.plugins / mimeTypes -------------------------------------
  // Desktop Chrome ships five synthetic PDF plugin entries. Android ships none,
  // and the arrays must still be real PluginArray/MimeTypeArray instances.
  try {
    const emptyPlugins = Object.create(PluginArray.prototype);
    Object.defineProperty(emptyPlugins, 'length', { value: 0, enumerable: false });
    const emptyMimes = Object.create(MimeTypeArray.prototype);
    Object.defineProperty(emptyMimes, 'length', { value: 0, enumerable: false });
    for (const [prop, val] of [['plugins', emptyPlugins], ['mimeTypes', emptyMimes]]) {
      nat.defineGetter(N, prop, () => val);
    }
  } catch (e) { /* PluginArray absent: nothing to hide */ }

  // ---- navigator.connection ----------------------------------------------
  try {
    const c = js.connection;
    const NI = window.NetworkInformation && NetworkInformation.prototype;
    if (NI) {
      nat.defineGetter(NI, 'effectiveType', () => c.effectiveType);
      nat.defineGetter(NI, 'type', () => c.type);
      nat.defineGetter(NI, 'rtt', () => c.rtt);
      nat.defineGetter(NI, 'downlink', () => c.downlink);
      nat.defineGetter(NI, 'saveData', () => c.saveData);
    }
  } catch (e) { /* ignore */ }

  // ---- navigator.userAgentData -------------------------------------------
  const ud = js.uaData;
  const lowEntropy = () => ({
    brands: ud.brands.map((b) => ({ brand: b.brand, version: b.version })),
    mobile: ud.mobile,
    platform: ud.platform,
  });

  /**
   * getHighEntropyValues resolves only the hints the caller asked for, in the
   * order the spec lists them, and rejects unknown hints with a NotAllowedError
   * — returning everything unconditionally is a detectable shortcut.
   */
  const HIGH_ENTROPY = {
    architecture: () => ud.architecture,
    bitness: () => ud.bitness,
    model: () => ud.model,
    platformVersion: () => ud.platformVersion,
    uaFullVersion: () => ud.uaFullVersion,
    fullVersionList: () => ud.fullVersionList.map((b) => ({ ...b })),
    wow64: () => ud.wow64,
    formFactors: () => ud.formFactors.slice(),
  };

  function highEntropy(hints) {
    const out = lowEntropy();
    if (!Array.isArray(hints)) {
      return Promise.reject(new TypeError(
        "Failed to execute 'getHighEntropyValues' on 'NavigatorUAData': " +
        'The provided value cannot be converted to a sequence.'
      ));
    }
    for (const h of hints) {
      if (!(h in HIGH_ENTROPY)) {
        return Promise.reject(new DOMException(
          'Not available.', 'NotAllowedError'
        ));
      }
    }
    for (const h of hints) out[h] = HIGH_ENTROPY[h]();
    return Promise.resolve(out);
  }

  try {
    if (window.NavigatorUAData) {
      const P = NavigatorUAData.prototype;
      nat.defineGetter(P, 'brands', () => lowEntropy().brands);
      nat.defineGetter(P, 'mobile', () => ud.mobile);
      nat.defineGetter(P, 'platform', () => ud.platform);
      nat.replaceMethod(P, 'getHighEntropyValues', () => function getHighEntropyValues(hints) {
        return highEntropy(hints);
      });
      nat.replaceMethod(P, 'toJSON', () => function toJSON() {
        return lowEntropy();
      });
    }
  } catch (e) { /* ignore */ }

  // ---- Android/desktop API surface ---------------------------------------
  // Chrome on Android simply does not ship these. Leaving desktop-only APIs in
  // place while claiming to be a phone is a stronger signal than a wrong UA,
  // because it cannot be explained by a spoofing-averse user.
  const DESKTOP_ONLY_NAVIGATOR = [
    'serial',      // Web Serial: desktop only
    'hid',         // WebHID: desktop only
    'keyboard',    // Keyboard Map API: desktop only
    'windowControlsOverlay',
    'managed',
  ];
  for (const prop of DESKTOP_ONLY_NAVIGATOR) {
    try { delete Navigator.prototype[prop]; } catch (e) { /* ignore */ }
  }

  const DESKTOP_ONLY_WINDOW = [
    'SharedWorker',        // unsupported on Android
    'showOpenFilePicker',  // File System Access: desktop only
    'showSaveFilePicker',
    'showDirectoryPicker',
    'FileSystemHandle',
    'FileSystemFileHandle',
    'FileSystemDirectoryHandle',
    'FileSystemWritableFileStream',
  ];
  for (const prop of DESKTOP_ONLY_WINDOW) {
    try { delete window[prop]; } catch (e) { /* ignore */ }
  }

  // getInstalledRelatedApps is Android-only and must exist.
  try {
    if (!('getInstalledRelatedApps' in N)) {
      const fn = function getInstalledRelatedApps() { return Promise.resolve([]); };
      nat.markNative(fn, 'getInstalledRelatedApps');
      nat.defineValue(N, 'getInstalledRelatedApps', fn);
    }
  } catch (e) { /* ignore */ }

  // ---- storage.estimate ---------------------------------------------------
  // Chrome grants a share of free disk. A desktop-sized quota on a "phone" is
  // an easy contradiction to spot, so scale it to the device's memory class.
  try {
    if (navigator.storage) {
      const quota = Math.round(js.deviceMemory * 1024 * 1024 * 1024 * 0.6);
      const usage = Math.round(quota * 0.0004);
      nat.replaceMethod(
        Object.getPrototypeOf(navigator.storage),
        'estimate',
        () => function estimate() {
          return Promise.resolve({
            quota,
            usage,
            usageDetails: { indexedDB: usage },
          });
        }
      );
    }
  } catch (e) { /* ignore */ }
}
