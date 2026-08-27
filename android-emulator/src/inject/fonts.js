/**
 * Font availability. Runs inside the page.
 *
 * Scope note, because this is the one layer JS cannot fully own: the reliable
 * font probe is DOM-based — render a string in `"Target", monospace`, measure
 * `offsetWidth`, compare against the monospace baseline — and that measurement
 * happens inside Blink's layout engine, below anything reachable from script.
 * Patching it from here would mean intercepting layout, which is both fragile
 * and self-announcing.
 *
 * So this module covers the probes that *are* script-level (canvas metrics,
 * FontFaceSet.check, the Local Font Access API), and the actual font set the
 * browser can see is constrained at launch by fontconfig — see
 * tools/fontconfig.js. Use both; neither is sufficient alone.
 */
export function patchFonts(cfg, nat) {
  const allowed = new Set(cfg.js.fonts.map((f) => f.toLowerCase()));

  // Generic families always resolve, on every platform.
  const GENERIC = new Set([
    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy',
    'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded',
    'math', 'emoji', 'fangsong', '-webkit-standard', 'inherit', 'initial',
  ]);

  function isAvailable(family) {
    const f = family.trim().replace(/^["']|["']$/g, '').toLowerCase();
    return GENERIC.has(f) || allowed.has(f);
  }

  /** Split a CSS family list on top-level commas, preserving quoted names. */
  function splitFamilies(list) {
    const out = [];
    let cur = '';
    let quote = null;
    for (const ch of list) {
      if (quote) {
        cur += ch;
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
        cur += ch;
      } else if (ch === ',') {
        out.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur.trim()) out.push(cur);
    return out.map((x) => x.trim()).filter(Boolean);
  }

  const SIZE = String.raw`(?:[\d.]+(?:px|pt|pc|in|cm|mm|em|rem|ex|ch|vw|vh|vmin|vmax|%)|xx-small|x-small|small|medium|large|x-large|xx-large|smaller|larger)`;
  const FONT_SHORTHAND = new RegExp(`^(.*?)(${SIZE})(\\s*/\\s*\\S+)?\\s+(.+)$`);

  /** Drop families the device does not have, so the browser falls through to
   *  the generic exactly as a real device with those fonts missing would. */
  function filterFontShorthand(value) {
    const m = FONT_SHORTHAND.exec(String(value));
    if (!m) return null;
    const [, prefix, size, lineHeight, families] = m;
    const kept = splitFamilies(families).filter(isAvailable);
    if (!kept.length) kept.push('sans-serif');
    return `${prefix}${size}${lineHeight || ''} ${kept.join(', ')}`;
  }

  // ---- canvas text metrics ------------------------------------------------
  try {
    const proto = CanvasRenderingContext2D.prototype;
    const desc = Object.getOwnPropertyDescriptor(proto, 'font');
    if (desc && desc.get && desc.set) {
      const origGet = desc.get;
      const origSet = desc.set;
      // Chrome echoes back the *normalized* string the page assigned, unknown
      // families included. Capturing that normalization before substituting
      // keeps the getter honest while the renderer sees the filtered list.
      const shown = new WeakMap();

      const setter = function (value) {
        const filtered = filterFontShorthand(value);
        if (filtered === null) {
          origSet.call(this, value);
          shown.delete(this);
          return;
        }
        origSet.call(this, value);
        shown.set(this, origGet.call(this));
        origSet.call(this, filtered);
      };
      const getter = function () {
        const s = shown.get(this);
        return s !== undefined ? s : origGet.call(this);
      };
      nat.markNative(setter, 'set font');
      nat.markNative(getter, 'get font');
      Object.defineProperty(proto, 'font', {
        get: getter,
        set: setter,
        enumerable: desc.enumerable,
        configurable: true,
      });
    }
  } catch (e) { /* ignore */ }

  // ---- FontFaceSet.check is deliberately NOT patched ----------------------
  // `document.fonts.check('12px Calibri')` returns true in real Chrome whether
  // or not Calibri exists: FontFaceSet only tracks *web* fonts, and any local
  // family is reported as immediately usable. It is not a font-detection
  // channel, and making it answer false for missing families would invent a
  // behaviour no real browser has — a detection vector rather than a defence.

  // ---- Local Font Access API ----------------------------------------------
  // queryLocalFonts is desktop-only; on Android it does not exist at all.
  try { delete window.queryLocalFonts; } catch (e) { /* ignore */ }
  try { delete window.FontData; } catch (e) { /* ignore */ }
}
