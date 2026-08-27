#!/usr/bin/env node
/**
 * Downloads the AOSP font set so the browser can be given exactly the fonts an
 * Android device has.
 *
 * This is the half of font emulation that JavaScript cannot do. The decisive
 * probe measures rendered text through DOM layout, below anything script can
 * patch, so the only real answer is to constrain the font set the browser sees
 * (src/net/fonts.js turns this directory into a fontconfig).
 *
 *   node tools/fetch-fonts.mjs ./android-fonts
 *   andro verify pixel-8-pro --fonts ./android-fonts
 *
 * Everything fetched is SIL OFL or Apache-2.0, from the upstream google/fonts
 * repository. Licences are downloaded alongside the faces.
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join, basename } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/google/fonts/main';

/**
 * `family` is the name fontconfig will expose, which is what the profile's font
 * list must match. Where AOSP's name differs from the Google Fonts release name
 * (Droid Sans Mono is Roboto Mono's ancestor), the alias is handled in the
 * generated fontconfig rather than by renaming the file.
 */
const FONTS = [
  { path: 'ofl/roboto/Roboto%5Bwdth,wght%5D.ttf', family: 'Roboto' },
  { path: 'ofl/roboto/Roboto-Italic%5Bwdth,wght%5D.ttf', family: 'Roboto Italic' },
  { path: 'ofl/notosans/NotoSans%5Bwdth,wght%5D.ttf', family: 'Noto Sans' },
  { path: 'ofl/notoserif/NotoSerif%5Bwdth,wght%5D.ttf', family: 'Noto Serif' },
  { path: 'ofl/robotomono/RobotoMono%5Bwght%5D.ttf', family: 'Roboto Mono' },
  { path: 'ofl/cutivemono/CutiveMono-Regular.ttf', family: 'Cutive Mono' },
  { path: 'apache/comingsoon/ComingSoon-Regular.ttf', family: 'Coming Soon' },
  { path: 'ofl/dancingscript/DancingScript%5Bwght%5D.ttf', family: 'Dancing Script' },
  { path: 'ofl/carroisgothicsc/CarroisGothicSC-Regular.ttf', family: 'Carrois Gothic SC' },
];

const LICENCES = [
  'ofl/roboto/OFL.txt',
  'ofl/notosans/OFL.txt',
  'ofl/dancingscript/OFL.txt',
  'apache/comingsoon/LICENSE.txt',
];

async function fetchTo(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

async function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: node tools/fetch-fonts.mjs <output-dir>');
    process.exitCode = 1;
    return;
  }
  await mkdir(dir, { recursive: true });

  const failed = [];
  for (const font of FONTS) {
    const name = decodeURIComponent(basename(font.path));
    process.stdout.write(`  ${font.family} ... `);
    try {
      await fetchTo(`${BASE}/${font.path}`, join(dir, name));
      console.log('ok');
    } catch (err) {
      console.log(`FAILED (${err.message})`);
      failed.push(font.family);
    }
  }

  await mkdir(join(dir, 'licenses'), { recursive: true });
  for (const lic of LICENCES) {
    try {
      await fetchTo(`${BASE}/${lic}`, join(dir, 'licenses', lic.replace(/\//g, '_')));
    } catch { /* a missing licence copy is not fatal to the download */ }
  }

  const got = (await readdir(dir)).filter((f) => /\.ttf$/i.test(f));
  console.log(`\n${got.length} face(s) in ${dir}`);
  if (failed.length) {
    console.log(`could not fetch: ${failed.join(', ')}`);
    // A partial set still beats the host's fonts, but say so plainly: the
    // profile claims families that will not be there.
    console.log('The profile will claim families this directory does not contain.');
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exitCode = 1;
});
