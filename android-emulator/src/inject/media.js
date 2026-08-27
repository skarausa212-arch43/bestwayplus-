/**
 * Media devices, codec support, battery, permissions and TTS voices.
 * Runs inside the page.
 */
export function patchMedia(cfg, nat) {
  const js = cfg.js;

  // ---- enumerateDevices ---------------------------------------------------
  // Before camera/mic permission is granted Chrome returns one bare entry per
  // available kind: empty deviceId, empty label, empty groupId. Android also
  // never enumerates `audiooutput` — output routing is the OS's business — so
  // a list containing speakers contradicts the platform.
  try {
    const MDproto = Object.getPrototypeOf(navigator.mediaDevices || {});
    if (MDproto && typeof MDproto.enumerateDevices === 'function') {
      const makeInfo = (kind) => {
        const info = window.MediaDeviceInfo
          ? Object.create(MediaDeviceInfo.prototype)
          : {};
        for (const [k, v] of [
          ['deviceId', ''],
          ['kind', kind],
          ['label', ''],
          ['groupId', ''],
        ]) {
          Object.defineProperty(info, k, {
            get: nat.markNative(function () { return v; }, `get ${k}`),
            enumerable: true,
            configurable: true,
          });
        }
        Object.defineProperty(info, 'toJSON', {
          value: nat.markNative(function toJSON() {
            return { deviceId: '', kind, label: '', groupId: '' };
          }, 'toJSON'),
          configurable: true,
        });
        return info;
      };

      nat.replaceMethod(MDproto, 'enumerateDevices', () =>
        function enumerateDevices() {
          return Promise.resolve([makeInfo('audioinput'), makeInfo('videoinput')]);
        }
      );
    }
  } catch (e) { /* ignore */ }

  // ---- codec support ------------------------------------------------------
  const codecs = js.codecs;

  function canPlay(type) {
    if (typeof type !== 'string') return '';
    const norm = type.trim().replace(/\s*;\s*/g, '; ');
    if (norm in codecs) return codecs[norm];
    // Container without a codecs= parameter: "maybe", as Chrome reports.
    const base = norm.split(';')[0].trim();
    for (const k of Object.keys(codecs)) {
      if (k.split(';')[0].trim() === base) return norm.includes('codecs') ? '' : 'maybe';
    }
    return '';
  }

  try {
    nat.replaceMethod(HTMLMediaElement.prototype, 'canPlayType', () =>
      function canPlayType(type) { return canPlay(type); }
    );
  } catch (e) { /* ignore */ }

  try {
    if (window.MediaSource && typeof MediaSource.isTypeSupported === 'function') {
      nat.replaceMethod(MediaSource, 'isTypeSupported', () =>
        function isTypeSupported(type) { return canPlay(type) === 'probably'; }
      );
    }
  } catch (e) { /* ignore */ }

  // decodingInfo must agree with canPlayType, and a phone reports hardware
  // acceleration for the formats its SoC decodes.
  try {
    const MCproto = window.MediaCapabilities && MediaCapabilities.prototype;
    if (MCproto) {
      nat.replaceMethod(MCproto, 'decodingInfo', (orig) =>
        function decodingInfo(config) {
          try {
            const type = config?.video?.contentType || config?.audio?.contentType;
            if (type) {
              const supported = canPlay(type) === 'probably';
              return Promise.resolve({
                supported,
                smooth: supported,
                powerEfficient: supported,
                configuration: config,
              });
            }
          } catch (e) { /* fall through */ }
          return orig.call(this, config);
        }
      );
    }
  } catch (e) { /* ignore */ }

  // ---- battery ------------------------------------------------------------
  try {
    const B = window.BatteryManager && BatteryManager.prototype;
    const b = js.battery;
    if (B) {
      nat.defineGetter(B, 'charging', () => b.charging);
      nat.defineGetter(B, 'level', () => b.level);
      // Chrome reports Infinity for the direction that does not apply, and
      // rounds the other to whole minutes.
      nat.defineGetter(B, 'chargingTime', () =>
        b.charging ? Math.round((1 - b.level) * 5400 / 60) * 60 : Infinity
      );
      nat.defineGetter(B, 'dischargingTime', () =>
        b.charging ? Infinity : Math.round(b.level * 43200 / 60) * 60
      );
    }
  } catch (e) { /* ignore */ }

  // ---- notifications ------------------------------------------------------
  // Headless Chrome ships with Notification.permission === 'denied' while
  // permissions.query() answers 'prompt'. That disagreement is a well-known
  // headless tell, so both are pinned to the un-decided state.
  try {
    if (window.Notification) {
      nat.defineGetter(Notification, 'permission', () => 'default');
      nat.replaceMethod(Notification, 'requestPermission', () =>
        function requestPermission(cb) {
          const r = Promise.resolve('default');
          if (typeof cb === 'function') r.then(cb);
          return r;
        }
      );
    }
  } catch (e) { /* ignore */ }

  try {
    const Pproto = window.Permissions && Permissions.prototype;
    if (Pproto) {
      nat.replaceMethod(Pproto, 'query', (orig) => function query(desc) {
        const name = desc && desc.name;
        if (name === 'notifications') {
          return orig.call(this, desc).then((status) => {
            try {
              Object.defineProperty(status, 'state', {
                get: nat.markNative(function () { return 'prompt'; }, 'get state'),
                configurable: true,
              });
            } catch (e) { /* ignore */ }
            return status;
          });
        }
        return orig.call(this, desc);
      });
    }
  } catch (e) { /* ignore */ }

  // ---- speech synthesis ---------------------------------------------------
  // An empty voice list is a headless giveaway: every Android device ships the
  // Google TTS engine. Voices are local (no network voices) and named per BCP-47.
  try {
    if (window.speechSynthesis && window.SpeechSynthesisVoice) {
      const langs = Array.from(new Set([...js.languages, 'en-US', 'en-GB', 'de-DE', 'es-ES', 'fr-FR', 'it-IT', 'ru-RU', 'ja-JP', 'ko-KR', 'pt-BR', 'hi-IN']));
      const voices = langs.map((lang) => {
        const v = Object.create(SpeechSynthesisVoice.prototype);
        const fields = {
          voiceURI: lang,
          name: lang,
          lang,
          localService: true,
          default: lang === js.language,
        };
        for (const [k, val] of Object.entries(fields)) {
          Object.defineProperty(v, k, {
            get: nat.markNative(function () { return val; }, `get ${k}`),
            enumerable: true,
            configurable: true,
          });
        }
        return v;
      });
      nat.replaceMethod(
        Object.getPrototypeOf(speechSynthesis),
        'getVoices',
        () => function getVoices() { return voices.slice(); }
      );
    }
  } catch (e) { /* ignore */ }
}
