/**
 * screen, devicePixelRatio, window geometry and the media queries that follow
 * from being a touchscreen. Runs inside the page.
 */
export function patchScreen(cfg, nat) {
  const s = cfg.js.screen;
  const S = Screen.prototype;

  nat.defineGetter(S, 'width', () => s.width);
  nat.defineGetter(S, 'height', () => s.height);
  nat.defineGetter(S, 'availWidth', () => s.availWidth);
  nat.defineGetter(S, 'availHeight', () => s.availHeight);
  nat.defineGetter(S, 'availLeft', () => s.availLeft);
  nat.defineGetter(S, 'availTop', () => s.availTop);
  nat.defineGetter(S, 'colorDepth', () => s.colorDepth);
  nat.defineGetter(S, 'pixelDepth', () => s.pixelDepth);
  // Multi-screen API: a phone always reports a single, primary, internal screen.
  nat.defineGetter(S, 'isExtended', () => false);

  try {
    nat.defineGetter(window, 'devicePixelRatio', () => s.dpr);
  } catch (e) { /* ignore */ }

  try {
    const O = window.ScreenOrientation && ScreenOrientation.prototype;
    if (O) {
      nat.defineGetter(O, 'type', () => s.orientation.type);
      nat.defineGetter(O, 'angle', () => s.orientation.angle);
    }
  } catch (e) { /* ignore */ }

  // A browser window on Android is the whole screen: there is no window
  // position, and outer dimensions track the viewport rather than the desktop.
  try {
    for (const prop of ['screenX', 'screenY', 'screenLeft', 'screenTop']) {
      nat.defineGetter(window, prop, () => 0);
    }
    nat.defineGetter(window, 'outerWidth', function () { return window.innerWidth; });
    nat.defineGetter(window, 'outerHeight', function () { return window.innerHeight; });
  } catch (e) { /* ignore */ }

  // ---- media queries ------------------------------------------------------
  // Only the queries that describe the input hardware and the panel are
  // answered here; everything else is delegated so page layout keeps working.
  const FORCED = {
    '(pointer: coarse)': true,
    '(pointer: fine)': false,
    '(pointer: none)': false,
    '(any-pointer: coarse)': true,
    '(any-pointer: fine)': false,
    '(hover: none)': true,
    '(hover: hover)': false,
    '(any-hover: none)': true,
    '(any-hover: hover)': false,
    '(display-mode: browser)': true,
    '(display-mode: standalone)': false,
  };

  function normalize(q) {
    return String(q).replace(/\s+/g, ' ').trim().toLowerCase();
  }

  const origMatchMedia = window.matchMedia;
  if (typeof origMatchMedia === 'function') {
    nat.replaceMethod(window, 'matchMedia', (orig) => function matchMedia(query) {
      const result = orig.call(this, query);
      const forced = FORCED[normalize(query)];
      if (forced !== undefined) {
        try {
          Object.defineProperty(result, 'matches', {
            get: nat.markNative(function () { return forced; }, 'get matches'),
            configurable: true,
          });
        } catch (e) { /* ignore */ }
      }
      return result;
    });
  }

  // ---- touch --------------------------------------------------------------
  // Playwright's hasTouch already installs the Touch* constructors; this only
  // covers the case where they are missing, since `'ontouchstart' in window` is
  // the single most common mobile probe.
  try {
    if (!('ontouchstart' in window)) {
      nat.defineValue(window, 'ontouchstart', null);
    }
  } catch (e) { /* ignore */ }
}
