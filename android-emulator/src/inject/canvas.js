/**
 * Canvas 2D readback and text metrics. Runs inside the page.
 *
 * The dither is a pure function of (seed, pixel index, channel, original
 * value). That property is the whole design: a fingerprinter that renders the
 * same scene twice and compares hashes must get the same answer both times.
 * Per-call randomness — the obvious implementation — fails exactly that check,
 * and "canvas hash is unstable within a session" is a far louder signal than
 * any particular hash value.
 */
export function patchCanvas(cfg, nat) {
  const seed = cfg.js.canvas.seed >>> 0;

  const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  const origGetContext = HTMLCanvasElement.prototype.getContext;
  const origCreateElement = Document.prototype.createElement;
  const origPutImageData = CanvasRenderingContext2D.prototype.putImageData;
  const origDrawImage = CanvasRenderingContext2D.prototype.drawImage;

  /** Perturb ~1 subpixel in 3 by +/-1. Fully transparent pixels are left alone:
   *  real GPU variation shows up in what was drawn, not in untouched areas. */
  function dither(data) {
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      const p = i >> 2;
      for (let c = 0; c < 3; c++) {
        const v = data[i + c];
        const k = nat.hash32(seed, p, (c << 8) | v) % 6;
        if (k === 0) { if (v > 0) data[i + c] = v - 1; }
        else if (k === 1) { if (v < 255) data[i + c] = v + 1; }
      }
    }
    return data;
  }

  /** Copy `source` into a detached canvas and dither the copy, so a page that
   *  keeps drawing onto its own canvas never sees our noise accumulate. */
  function ditheredCopy(source) {
    const w = source.width | 0;
    const h = source.height | 0;
    if (w <= 0 || h <= 0) return source;
    const copy = origCreateElement.call(document, 'canvas');
    copy.width = w;
    copy.height = h;
    const ctx = origGetContext.call(copy, '2d', { willReadFrequently: true });
    if (!ctx) return source;
    origDrawImage.call(ctx, source, 0, 0);
    const img = origGetImageData.call(ctx, 0, 0, w, h);
    dither(img.data);
    origPutImageData.call(ctx, img, 0, 0);
    return copy;
  }

  nat.replaceMethod(
    CanvasRenderingContext2D.prototype,
    'getImageData',
    (orig) => function getImageData(sx, sy, sw, sh, settings) {
      const img = orig.call(this, sx, sy, sw, sh, settings);
      try { dither(img.data); } catch (e) { /* ignore */ }
      return img;
    }
  );

  nat.replaceMethod(
    HTMLCanvasElement.prototype,
    'toDataURL',
    (orig) => function toDataURL(type, quality) {
      try {
        return orig.call(ditheredCopy(this), type, quality);
      } catch (e) {
        return orig.call(this, type, quality);
      }
    }
  );

  nat.replaceMethod(
    HTMLCanvasElement.prototype,
    'toBlob',
    (orig) => function toBlob(callback, type, quality) {
      try {
        return orig.call(ditheredCopy(this), callback, type, quality);
      } catch (e) {
        return orig.call(this, callback, type, quality);
      }
    }
  );

  // OffscreenCanvas takes the same treatment; workers reach it too.
  try {
    if (window.OffscreenCanvasRenderingContext2D) {
      nat.replaceMethod(
        OffscreenCanvasRenderingContext2D.prototype,
        'getImageData',
        (orig) => function getImageData(sx, sy, sw, sh, settings) {
          const img = orig.call(this, sx, sy, sw, sh, settings);
          try { dither(img.data); } catch (e) { /* ignore */ }
          return img;
        }
      );
    }
  } catch (e) { /* ignore */ }

  // ---- text metrics -------------------------------------------------------
  // Glyph rasterization differs per device, so TextMetrics floats are part of
  // the fingerprint. Scaling by a hash *of the original value* keeps the result
  // stable for a given string+font while shifting it off the stock Chromium
  // value. The perturbation is ~1e-4 relative: invisible to layout, decisive
  // to a hash.
  try {
    const TM = window.TextMetrics && TextMetrics.prototype;
    if (TM) {
      const METRICS = [
        'width',
        'actualBoundingBoxLeft',
        'actualBoundingBoxRight',
        'actualBoundingBoxAscent',
        'actualBoundingBoxDescent',
        'fontBoundingBoxAscent',
        'fontBoundingBoxDescent',
      ];
      for (const prop of METRICS) {
        const desc = Object.getOwnPropertyDescriptor(TM, prop);
        if (!desc || !desc.get) continue;
        const origGet = desc.get;
        nat.defineGetter(TM, prop, function () {
          const v = origGet.call(this);
          if (typeof v !== 'number' || !isFinite(v) || v === 0) return v;
          // Quantize the input so tiny float differences don't flip the hash.
          const q = Math.round(v * 4096);
          const eps = (nat.hashFloat(seed, q, prop.length) - 0.5) * 2e-4;
          return v * (1 + eps);
        });
      }
    }
  } catch (e) { /* ignore */ }
}
