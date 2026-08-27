import { makeHelpers } from './native.js';
import { patchNavigator } from './navigator.js';
import { patchScreen } from './screen.js';
import { patchCanvas } from './canvas.js';
import { patchWebGL } from './webgl.js';
import { patchAudio } from './audio.js';
import { patchFonts } from './fonts.js';
import { patchMedia } from './media.js';
import { patchMisc } from './misc.js';

/**
 * Order matters. `makeHelpers` replaces Function.prototype.toString and must
 * run before anything registers a patched function with it; `patchNavigator`
 * deletes desktop-only globals that later modules would otherwise re-detect.
 */
const MODULES = [
  patchNavigator,
  patchScreen,
  patchCanvas,
  patchWebGL,
  patchAudio,
  patchFonts,
  patchMedia,
  patchMisc,
];

/**
 * Serializes the patch modules into one script for `addInitScript`.
 *
 * Each module is a self-contained function of (cfg, nat) — no imports, no
 * closure over module scope — precisely so that `Function.prototype.toString`
 * produces runnable source here. A module that captures a module-level
 * binding will serialize to something that throws a ReferenceError in the
 * page, which is why every module takes what it needs as an argument.
 *
 * Every module is wrapped in its own try/catch: a failure in, say, the WebGL
 * patch on a device with no GPU must not leave navigator half-patched, which
 * would be far more detectable than not patching at all.
 */
export function buildInitScript(profile, options = {}) {
  const cfg = {
    js: {
      ...profile.js,
      webrtcPublicIp: options.publicIp || null,
    },
  };

  const body = MODULES.map(
    (m) => `  try { (${m.toString()})(cfg, nat); } catch (e) { report(${JSON.stringify(m.name)}, e); }`
  ).join('\n');

  return `(() => {
  'use strict';
  const cfg = ${JSON.stringify(cfg)};
  const report = ${options.debug ? '(m, e) => console.warn("[emu] " + m + " failed:", e)' : '() => {}'};
  const nat = (${makeHelpers.toString()})();
${body}
})();`;
}

export { MODULES };
