/**
 * Two devices, two identities, one script.
 *
 *   node examples/basic.mjs
 *
 * Shows the property the whole design turns on: a seed reproduces a device
 * exactly, and two seeds on the same model produce two distinguishable devices.
 */
import { launchDevice, deriveProfile } from '../src/index.js';

const FONTS = process.env.ANDRO_FONTS || null;

async function fingerprintOf(deviceId, seed) {
  const session = await launchDevice({
    deviceId,
    seed,
    locale: 'ru-RU',
    fontsDir: FONTS,
  });
  try {
    const page = await session.newPage();
    await page.goto('about:blank');
    return await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 200;
      c.height = 40;
      const ctx = c.getContext('2d');
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#069';
      ctx.fillText('fingerprint me', 2, 20);

      let h = 0x811c9dc5;
      for (const ch of c.toDataURL()) {
        h ^= ch.charCodeAt(0);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
      return {
        ua: navigator.userAgent,
        screen: `${screen.width}x${screen.height}@${devicePixelRatio}`,
        gpu: (() => {
          const gl = document.createElement('canvas').getContext('webgl');
          const d = gl.getExtension('WEBGL_debug_renderer_info');
          return gl.getParameter(d.UNMASKED_RENDERER_WEBGL);
        })(),
        canvasHash: h.toString(16),
      };
    });
  } finally {
    await session.close();
  }
}

// Derivation alone needs no browser, so the identity can be inspected first.
const preview = deriveProfile({ deviceId: 'galaxy-s23-ultra', seed: 'account-a', locale: 'ru-RU' });
console.log('derived without launching anything:');
console.log(`  ${preview.deviceName}, ${preview.js.timezone}, seed id ${preview.seedId}`);
console.log(`  ${preview.net.clientHints['sec-ch-ua-model']} on Chrome ${preview.device.browser.full}\n`);

const a1 = await fingerprintOf('galaxy-s23-ultra', 'account-a');
const a2 = await fingerprintOf('galaxy-s23-ultra', 'account-a');
const b = await fingerprintOf('pixel-8-pro', 'account-b');

console.log('same device, same seed, twice:');
console.log(`  ${a1.canvasHash}  ${a1.gpu}  ${a1.screen}`);
console.log(`  ${a2.canvasHash}  ${a2.gpu}  ${a2.screen}`);
console.log(`  identical: ${a1.canvasHash === a2.canvasHash}\n`);

console.log('different device and seed:');
console.log(`  ${b.canvasHash}  ${b.gpu}  ${b.screen}`);
console.log(`  distinguishable from the first: ${a1.canvasHash !== b.canvasHash}`);
