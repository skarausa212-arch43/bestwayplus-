/**
 * Web Audio. Runs inside the page.
 *
 * Audio fingerprints are collected by rendering an oscillator through a
 * compressor in an OfflineAudioContext and hashing the resulting floats. The
 * differences between real devices come from the vendor's resampling and
 * mixing path, so the model here is a per-SoC gain, a DC offset and a
 * deterministic dither — applied once per buffer, since getChannelData hands
 * back the *same* Float32Array every call and re-applying would compound.
 */
export function patchAudio(cfg, nat) {
  const a = cfg.js.audio;
  const seed = a.seed >>> 0;
  const processed = new WeakSet();

  function shape(arr) {
    if (!arr || processed.has(arr)) return arr;
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i];
      if (v === 0) continue;
      // Quantized index keeps the dither stable while staying content-blind.
      const n = (nat.hashFloat(seed, i, (v * 1e6) | 0) - 0.5) * 2 * a.noiseFloor;
      arr[i] = v * a.gain + a.dcOffset + n;
    }
    processed.add(arr);
    return arr;
  }

  try {
    nat.replaceMethod(AudioBuffer.prototype, 'getChannelData', (orig) =>
      function getChannelData(channel) {
        return shape(orig.call(this, channel));
      }
    );

    nat.replaceMethod(AudioBuffer.prototype, 'copyFromChannel', (orig) =>
      function copyFromChannel(destination, channelNumber, bufferOffset) {
        const r = orig.call(this, destination, channelNumber, bufferOffset);
        try { shape(destination); } catch (e) { /* ignore */ }
        return r;
      }
    );
  } catch (e) { /* ignore */ }

  // AnalyserNode is the other collection path.
  try {
    nat.replaceMethod(AnalyserNode.prototype, 'getFloatFrequencyData', (orig) =>
      function getFloatFrequencyData(array) {
        const r = orig.call(this, array);
        try {
          for (let i = 0; i < array.length; i++) {
            if (!isFinite(array[i])) continue;
            array[i] += (nat.hashFloat(seed, i, (array[i] * 100) | 0) - 0.5) * 0.002;
          }
        } catch (e) { /* ignore */ }
        return r;
      }
    );
  } catch (e) { /* ignore */ }

  // ---- context properties -------------------------------------------------
  // Android's audio HAL runs at 48 kHz. Desktop Chrome commonly reports 44100,
  // which contradicts an Android UA outright.
  try {
    const B = window.BaseAudioContext && BaseAudioContext.prototype;
    if (B) {
      const origRate = Object.getOwnPropertyDescriptor(B, 'sampleRate')?.get;
      nat.defineGetter(B, 'sampleRate', function () {
        // An OfflineAudioContext's rate is chosen by the caller: overriding it
        // would break rendering and be wrong anyway.
        if (window.OfflineAudioContext && this instanceof OfflineAudioContext) {
          return origRate ? origRate.call(this) : 48000;
        }
        return 48000;
      });
    }

    const A = window.AudioContext && AudioContext.prototype;
    if (A) {
      nat.defineGetter(A, 'baseLatency', () => 0.01);
      // Output latency drifts per device/session; keep it on the 128-frame grid.
      const frames = 128 * (3 + (nat.hash32(seed, 7, 11) % 6));
      nat.defineGetter(A, 'outputLatency', () => frames / 48000);
    }

    const D = window.AudioDestinationNode && AudioDestinationNode.prototype;
    if (D) nat.defineGetter(D, 'maxChannelCount', () => 2);
  } catch (e) { /* ignore */ }
}
