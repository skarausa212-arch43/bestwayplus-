/**
 * Deterministic randomness.
 *
 * Every "random" quantity in a profile — canvas dither, audio dither, the
 * fractional part of a battery level — is derived from the session seed. Two
 * runs with the same seed produce byte-identical fingerprints; two runs with
 * different seeds look like two different handsets. Nothing here may call
 * Math.random(), or the same profile would drift between runs and a site that
 * fingerprints twice would see two devices.
 */

/** FNV-1a, 32-bit. Cheap, well-distributed, and identical in JS and in the page. */
export function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: 32-bit state, passes gjrand, fine for fingerprint dither. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named sub-stream, so adding a new consumer cannot shift existing ones. */
export function subSeed(seed, label) {
  return fnv1a(`${seed}::${label}`);
}

export function rngFor(seed, label) {
  return mulberry32(subSeed(seed, label));
}

/** Integer in [min, max]. */
export function randInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

/** Fisher-Yates against a seeded rng. */
export function shuffle(rng, arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A stable 16-hex-char id for a seed, used to name profile storage dirs. */
export function seedId(seed) {
  const a = fnv1a(String(seed)).toString(16).padStart(8, '0');
  const b = fnv1a(`${seed}#salt`).toString(16).padStart(8, '0');
  return a + b;
}
