import { writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Restricts the browser's font set with fontconfig.
 *
 * Why this exists alongside src/inject/fonts.js: the decisive font probe is
 * DOM-based — render a string in `"Target", monospace` and compare
 * `offsetWidth` against the monospace baseline — and that measurement happens
 * inside Blink's layout engine, below anything script can patch. The only
 * honest way to answer it is to actually give the browser the font set the
 * emulated device has.
 *
 * Point `fontsDir` at a directory holding the Android faces (see
 * tools/fetch-fonts.mjs) and Chromium will see those and nothing else. Skip it
 * and the host's fonts leak through: the JS layer will still answer
 * `document.fonts.check` and canvas metrics correctly, but a DOM-based probe
 * will see Liberation, DejaVu and whatever else the container ships — which no
 * Android device has.
 */
export function fontconfigEnv(profile, { fontsDir, dir }) {
  if (!fontsDir) return {};

  const abs = resolve(fontsDir);
  if (!existsSync(abs)) {
    throw new Error(
      `fontsDir "${abs}" does not exist. Run tools/fetch-fonts.mjs to populate ` +
        `it, or omit fontsDir to run with the host's fonts (see src/net/fonts.js).`
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
  return { FONTCONFIG_FILE: confPath, FONTCONFIG_PATH: dir };
}
