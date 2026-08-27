import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Restricts the browser's font set.
 *
 * Why this exists alongside src/inject/fonts.js: the decisive font probe is
 * DOM-based — render a string in `"Target", monospace` and compare
 * `offsetWidth` against the monospace baseline — and that measurement happens
 * inside Blink's layout engine, below anything script can patch. The only
 * honest way to answer it is to actually give the browser the font set the
 * emulated device has.
 *
 * The mechanism is fontconfig, and fontconfig is Linux-only in Chromium. On
 * macOS Skia goes through CoreText and on Windows through DirectWrite; neither
 * reads FONTCONFIG_FILE, and neither offers a per-process way to hide the
 * system's fonts. So on those platforms this layer genuinely cannot run, and
 * `prepareFonts` says so rather than writing a config file that would be
 * ignored — a font restriction that silently does nothing is worse than none,
 * because you would believe the probe was covered.
 */

/** Chromium only consults fontconfig on Linux (and other X11/freetype hosts). */
export function fontconfigSupported(platform = process.platform) {
  return platform !== 'darwin' && platform !== 'win32';
}

/**
 * @returns {{env: Record<string,string>, active: boolean, reason: string}}
 *   `active` is whether the browser's font set is really constrained. Callers
 *   should surface it: verification severity depends on it.
 */
export function prepareFonts(profile, { fontsDir, dir, platform = process.platform } = {}) {
  if (!fontsDir) {
    return {
      env: {},
      active: false,
      reason: 'no fontsDir given, so the host font set is visible to DOM layout',
    };
  }

  if (!fontconfigSupported(platform)) {
    const os = platform === 'darwin' ? 'macOS (CoreText)' : 'Windows (DirectWrite)';
    return {
      env: {},
      active: false,
      reason:
        `fontsDir was given but Chromium on ${os} does not read fontconfig, and ` +
        `neither backend can hide the system's fonts from a single process. ` +
        `Canvas-based font probes are still handled by the JS layer; DOM-based ` +
        `ones will see the host's fonts. Run under Linux (a container is enough) ` +
        `for this layer.`,
    };
  }

  const abs = resolve(fontsDir);
  if (!existsSync(abs)) {
    throw new Error(
      `fontsDir "${abs}" does not exist. Run tools/fetch-fonts.mjs to populate ` +
        `it, or omit fontsDir to run with the host's fonts.`
    );
  }
  const faces = readdirSync(abs).filter((f) => /\.(ttf|otf|ttc)$/i.test(f));
  if (faces.length === 0) {
    throw new Error(
      `fontsDir "${abs}" contains no font files. A browser with no fonts renders ` +
        `nothing and is trivially detectable; refusing to launch that way.`
    );
  }

  const cacheDir = join(dir, 'fontconfig-cache');
  mkdirSync(cacheDir, { recursive: true });

  // No <include> of the system config: pulling in /etc/fonts/fonts.conf would
  // re-add the host's font directories and defeat the point.
  const conf = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${abs}</dir>
  <cachedir>${cacheDir}</cachedir>

  <!-- Generic families must resolve to something the device actually has. -->
  <alias><family>sans-serif</family><prefer><family>Roboto</family><family>Noto Sans</family></prefer></alias>
  <alias><family>serif</family><prefer><family>Noto Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>Droid Sans Mono</family><family>Roboto Mono</family></prefer></alias>
  <alias><family>cursive</family><prefer><family>Dancing Script</family></prefer></alias>
  <alias><family>fantasy</family><prefer><family>Coming Soon</family></prefer></alias>
  <alias><family>system-ui</family><prefer><family>Roboto</family></prefer></alias>

  <!-- AOSP ships Droid Sans Mono; its maintained descendant is released as
       Roboto Mono. Aliased rather than renamed so the file keeps its real name. -->
  <alias binding="same"><family>Droid Sans Mono</family><accept><family>Roboto Mono</family></accept></alias>

  <!-- Android maps these legacy names onto its own faces, so they do resolve on
       a real device. Leaving them unresolvable would be its own inconsistency:
       no Android phone reports Arial as missing. -->
  <alias binding="same"><family>Arial</family><accept><family>Roboto</family></accept></alias>
  <alias binding="same"><family>Helvetica</family><accept><family>Roboto</family></accept></alias>
  <alias binding="same"><family>Times New Roman</family><accept><family>Noto Serif</family></accept></alias>
  <alias binding="same"><family>Courier New</family><accept><family>Roboto Mono</family></accept></alias>

  <match target="pattern">
    <edit name="dpi" mode="assign"><double>${Math.round(profile.device.panel.ppi)}</double></edit>
  </match>
</fontconfig>
`;

  const confPath = join(dir, 'fonts.conf');
  writeFileSync(confPath, conf, 'utf8');
  return {
    env: { FONTCONFIG_FILE: confPath, FONTCONFIG_PATH: dir },
    active: true,
    reason: `${faces.length} face(s) from ${abs}`,
  };
}
