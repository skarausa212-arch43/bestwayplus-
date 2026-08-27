/**
 * Runs inside the emulated page and reports everything a fingerprinter would
 * read. Serialized via page.evaluate, so it must be self-contained.
 *
 * Anything collected twice (canvas, audio) is collected twice *on purpose*:
 * instability between two reads in the same session is a louder signal than any
 * particular value, and it is the failure mode a naive noise implementation has.
 */
export async function collectFingerprint() {
  const out = { errors: [] };
  const guard = (name, fn) => {
    try {
      return fn();
    } catch (e) {
      out.errors.push(`${name}: ${e && e.message}`);
      return null;
    }
  };

  // ---- navigator ---------------------------------------------------------
  out.navigator = guard('navigator', () => ({
    userAgent: navigator.userAgent,
    appVersion: navigator.appVersion,
    platform: navigator.platform,
    vendor: navigator.vendor,
    productSub: navigator.productSub,
    hardwareConcurrency: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory,
    maxTouchPoints: navigator.maxTouchPoints,
    pdfViewerEnabled: navigator.pdfViewerEnabled,
    webdriver: navigator.webdriver,
    language: navigator.language,
    languages: navigator.languages.slice(),
    pluginCount: navigator.plugins.length,
    mimeTypeCount: navigator.mimeTypes.length,
    doNotTrack: navigator.doNotTrack,
  }));

  out.uaData = await guard('uaData', async () => {
    if (!navigator.userAgentData) return null;
    const high = await navigator.userAgentData.getHighEntropyValues([
      'architecture', 'bitness', 'model', 'platformVersion',
      'uaFullVersion', 'fullVersionList', 'formFactors',
    ]);
    return {
      mobile: navigator.userAgentData.mobile,
      platform: navigator.userAgentData.platform,
      brands: navigator.userAgentData.brands,
      ...high,
    };
  });

  out.connection = guard('connection', () =>
    navigator.connection
      ? {
          effectiveType: navigator.connection.effectiveType,
          rtt: navigator.connection.rtt,
          downlink: navigator.connection.downlink,
          saveData: navigator.connection.saveData,
        }
      : null
  );

  out.battery = await guard('battery', async () => {
    if (!navigator.getBattery) return null;
    const b = await navigator.getBattery();
    return { charging: b.charging, level: b.level };
  });

  // ---- screen ------------------------------------------------------------
  out.screen = guard('screen', () => ({
    width: screen.width,
    height: screen.height,
    availWidth: screen.availWidth,
    availHeight: screen.availHeight,
    colorDepth: screen.colorDepth,
    pixelDepth: screen.pixelDepth,
    devicePixelRatio: window.devicePixelRatio,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight,
    outerWidth: window.outerWidth,
    outerHeight: window.outerHeight,
    orientation: screen.orientation ? screen.orientation.type : null,
    windowOrientation: typeof window.orientation,
  }));

  out.media = guard('media', () => ({
    pointerCoarse: matchMedia('(pointer: coarse)').matches,
    hoverNone: matchMedia('(hover: none)').matches,
    touchStart: 'ontouchstart' in window,
  }));

  out.intl = guard('intl', () => ({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale: Intl.DateTimeFormat().resolvedOptions().locale,
    offsetMinutes: new Date('2024-01-15T12:00:00Z').getTimezoneOffset(),
  }));

  // ---- WebGL -------------------------------------------------------------
  out.webgl = guard('webgl', () => {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl');
    if (!gl) return null;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    return {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
      shadingLanguageVersion: gl.getParameter(gl.SHADING_LANGUAGE_VERSION),
      unmaskedVendor: dbg ? gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) : null,
      unmaskedRenderer: dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : null,
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
      maxRenderbufferSize: gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),
      maxViewportDims: Array.from(gl.getParameter(gl.MAX_VIEWPORT_DIMS)),
      maxVaryingVectors: gl.getParameter(gl.MAX_VARYING_VECTORS),
      extensionCount: gl.getSupportedExtensions().length,
      hasDisjointTimerQuery: gl.getSupportedExtensions().includes('EXT_disjoint_timer_query'),
      highFloat: (() => {
        const p = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.MEDIUM_FLOAT);
        return p ? [p.rangeMin, p.rangeMax, p.precision] : null;
      })(),
    };
  });

  // ---- canvas ------------------------------------------------------------
  const drawFingerprintScene = () => {
    const c = document.createElement('canvas');
    c.width = 260;
    c.height = 60;
    const ctx = c.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px "Arial"';
    ctx.fillStyle = '#f60';
    ctx.fillRect(0, 0, 100, 30);
    ctx.fillStyle = '#069';
    ctx.fillText('Device emulation ☠ 😀', 2, 15);
    ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
    ctx.fillText('Device emulation ☠ 😀', 4, 22);
    return c;
  };

  const hashString = (s) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };

  out.canvas = guard('canvas', () => {
    const a = drawFingerprintScene().toDataURL();
    const b = drawFingerprintScene().toDataURL();
    const c = drawFingerprintScene();
    const data = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    return {
      dataUrlHash: hashString(a),
      dataUrlStable: a === b,
      imageDataHash: hashString(Array.from(data.slice(0, 4096)).join(',')),
      imageDataStable: Array.from(data).join(',') === Array.from(d).join(','),
    };
  });

  out.textMetrics = guard('textMetrics', () => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '16px sans-serif';
    const w1 = ctx.measureText('mmmmmmmmmmlli').width;
    const w2 = ctx.measureText('mmmmmmmmmmlli').width;
    return { width: w1, stable: w1 === w2 };
  });

  // ---- audio -------------------------------------------------------------
  out.audio = await guard('audio', async () => {
    const render = async () => {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = 10000;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -50;
      comp.knee.value = 40;
      comp.ratio.value = 12;
      comp.attack.value = 0;
      comp.release.value = 0.25;
      osc.connect(comp);
      comp.connect(ctx.destination);
      osc.start(0);
      const buf = await ctx.startRendering();
      const ch = buf.getChannelData(0);
      let sum = 0;
      for (let i = 4500; i < 5000; i++) sum += Math.abs(ch[i]);
      return sum;
    };
    const a = await render();
    const b = await render();
    const live = new (window.AudioContext || window.webkitAudioContext)();
    const rate = live.sampleRate;
    const baseLatency = live.baseLatency;
    await live.close();
    return { sum: a, stable: a === b, sampleRate: rate, baseLatency };
  });

  // ---- fonts -------------------------------------------------------------
  // Font detection works by measurement, not by asking. `document.fonts.check`
  // answers true for every local family in real Chrome and is not collected
  // here for that reason. The two probes below are the ones that actually
  // discriminate, and they go through different engines: canvas metrics (which
  // the JS layer controls) and DOM layout (which only the real font set does).
  out.fonts = guard('fonts', () => {
    const SAMPLE = 'mmmmmmmmmmlliWWW@#$%';

    const canvasProbe = (family) => {
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = '72px monospace';
      const base = ctx.measureText(SAMPLE).width;
      ctx.font = `72px "${family}", monospace`;
      return ctx.measureText(SAMPLE).width !== base;
    };

    const span = document.createElement('span');
    span.textContent = SAMPLE;
    span.style.cssText =
      'position:absolute;left:-9999px;top:-9999px;font-size:72px;white-space:nowrap;';
    document.body.appendChild(span);
    const domProbe = (family) => {
      span.style.fontFamily = 'monospace';
      const base = span.offsetWidth;
      span.style.fontFamily = `"${family}", monospace`;
      return span.offsetWidth !== base;
    };

    // Faces every Android build ships. Monospace faces are deliberately absent:
    // on Android `monospace` *is* Droid Sans Mono, so probing it against the
    // monospace baseline shows no difference on a real device either.
    const android = ['Roboto', 'Noto Serif', 'Dancing Script'];
    // Faces no Android device has. Arial and Helvetica are deliberately absent
    // from this list: Android aliases them onto Roboto, so they *do* resolve.
    const desktop = [
      'Calibri', 'Segoe UI', 'Helvetica Neue', 'Tahoma',
      'DejaVu Sans', 'Liberation Sans', 'Nonexistent Face 12345',
    ];

    const result = { canvas: {}, dom: {}, queryLocalFonts: typeof window.queryLocalFonts };
    for (const f of [...android, ...desktop]) {
      result.canvas[f] = canvasProbe(f);
      result.dom[f] = domProbe(f);
    }
    span.remove();
    result.androidFaces = android;
    result.desktopFaces = desktop;
    return result;
  });

  // ---- API surface -------------------------------------------------------
  out.surface = guard('surface', () => ({
    serial: 'serial' in navigator,
    hid: 'hid' in navigator,
    keyboard: 'keyboard' in navigator,
    sharedWorker: 'SharedWorker' in window,
    showOpenFilePicker: 'showOpenFilePicker' in window,
    getInstalledRelatedApps: 'getInstalledRelatedApps' in navigator,
    standalone: 'standalone' in navigator,
    chromeObject: typeof window.chrome,
    chromeRuntime: !!(window.chrome && window.chrome.runtime),
    chromeLoadTimes: !!(window.chrome && typeof window.chrome.loadTimes === 'function'),
    notificationPermission: window.Notification ? Notification.permission : null,
    speechVoiceCount: window.speechSynthesis ? speechSynthesis.getVoices().length : 0,
  }));

  out.permissions = await guard('permissions', async () => {
    if (!navigator.permissions) return null;
    const s = await navigator.permissions.query({ name: 'notifications' });
    return { notifications: s.state };
  });

  out.devices = await guard('devices', async () => {
    if (!navigator.mediaDevices) return null;
    const list = await navigator.mediaDevices.enumerateDevices();
    return list.map((d) => d.kind);
  });

  out.codecs = guard('codecs', () => {
    const v = document.createElement('video');
    return {
      h264: v.canPlayType('video/mp4; codecs="avc1.42E01E"'),
      vp9: v.canPlayType('video/webm; codecs="vp9"'),
      av1: v.canPlayType('video/mp4; codecs="av01.0.05M.08"'),
      ogg: v.canPlayType('video/ogg; codecs="theora"'),
    };
  });

  // ---- patch integrity ---------------------------------------------------
  // The checks a detection script runs on the patches themselves.
  out.integrity = guard('integrity', () => {
    const uaDesc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
    return {
      // A patched value must not appear as an own property of the instance.
      uaIsOwnProperty: Object.prototype.hasOwnProperty.call(navigator, 'userAgent'),
      uaGetterSource: uaDesc && uaDesc.get ? uaDesc.get.toString() : null,
      uaGetterName: uaDesc && uaDesc.get ? uaDesc.get.name : null,
      toStringSource: Function.prototype.toString.toString(),
      getImageDataSource: CanvasRenderingContext2D.prototype.getImageData.toString(),
      getParameterName: window.WebGLRenderingContext
        ? WebGLRenderingContext.prototype.getParameter.name
        : null,
      // Calling a native method with the wrong receiver throws from inside the
      // implementation. On real Chrome the native frame contributes nothing to
      // the stack; a JS replacement contributes a frame naming itself. This is
      // the residual leak the patch approach cannot fully close, so it is
      // measured rather than assumed away.
      patchedStack: (() => {
        try {
          CanvasRenderingContext2D.prototype.getImageData.call(null, 0, 0, 1, 1);
        } catch (e) {
          return String(e.stack || '');
        }
        return null;
      })(),
      automationInStack: (() => {
        try {
          CanvasRenderingContext2D.prototype.getImageData.call(null, 0, 0, 1, 1);
        } catch (e) {
          return /puppeteer|playwright|selenium|webdriver|__pw/i.test(e.stack || '');
        }
        return false;
      })(),
    };
  });

  return out;
}
