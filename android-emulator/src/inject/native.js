/**
 * Helpers shared by every patch module. Runs inside the page.
 *
 * The whole point of this file is that a patch must be indistinguishable from
 * the function it replaces. Detection scripts do not check `navigator.userAgent`
 * and stop — they check that
 *   Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent').get
 * is a native function named `get userAgent`, that its `toString()` says
 * `[native code]`, that the property lives on the prototype rather than the
 * instance, and that `Function.prototype.toString` has not itself been replaced.
 * Each of those is handled here so the patch modules stay readable.
 */
export function makeHelpers() {
  const {
    defineProperty,
    getOwnPropertyDescriptor,
    getOwnPropertyNames,
    create,
    freeze,
  } = Object;

  const origToString = Function.prototype.toString;
  const origToStringStr = origToString.call(origToString);

  /**
   * patched function -> the text `Function.prototype.toString` should return.
   * A WeakMap keeps this invisible: there is no enumerable property anywhere on
   * the patched object pointing back at us.
   */
  const sourceOf = new WeakMap();

  /** Mark `fn` so it reports itself as native (optionally under `name`). */
  function markNative(fn, name) {
    if (typeof name === 'string') {
      try {
        defineProperty(fn, 'name', { value: name, configurable: true });
      } catch (e) { /* frozen name: not fatal */ }
    }
    sourceOf.set(fn, `function ${fn.name || ''}() { [native code] }`);
    return fn;
  }

  /** Copy the identity (name/length) of `orig` onto `fn`, then mark it native. */
  function mimic(fn, orig) {
    try {
      defineProperty(fn, 'name', {
        value: orig.name,
        configurable: true,
      });
      defineProperty(fn, 'length', {
        value: orig.length,
        configurable: true,
      });
    } catch (e) { /* ignore */ }
    sourceOf.set(fn, origToString.call(orig));
    return fn;
  }

  // Replace Function.prototype.toString itself, then register it in the map so
  // it reports its own original source. Without this last step the single most
  // common probe — `Function.prototype.toString.toString()` — exposes us.
  const patchedToString = function toString() {
    const own = sourceOf.get(this);
    if (own !== undefined) return own;
    return origToString.call(this);
  };
  defineProperty(patchedToString, 'name', { value: 'toString', configurable: true });
  defineProperty(patchedToString, 'length', { value: 0, configurable: true });
  sourceOf.set(patchedToString, origToStringStr);
  Function.prototype.toString = patchedToString;

  /**
   * Install a getter on a *prototype*. Defining data properties directly on
   * `navigator` is the classic mistake: the real ones are prototype accessors,
   * so `Object.getOwnPropertyNames(navigator)` returning `userAgent` is a
   * one-line detection.
   */
  function defineGetter(target, prop, getValue) {
    const desc = getOwnPropertyDescriptor(target, prop);
    const getter = function () {
      return getValue.call(this);
    };
    markNative(getter, `get ${prop}`);
    try {
      defineProperty(target, prop, {
        get: getter,
        set: desc && desc.set ? desc.set : undefined,
        enumerable: desc ? desc.enumerable : true,
        configurable: true,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Define a plain value that still looks like the original descriptor. */
  function defineValue(target, prop, value) {
    try {
      const desc = getOwnPropertyDescriptor(target, prop);
      defineProperty(target, prop, {
        value,
        writable: desc ? desc.writable !== false : true,
        enumerable: desc ? desc.enumerable : true,
        configurable: true,
      });
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Replace a method, keeping its name/length/source text. */
  function replaceMethod(target, prop, factory) {
    const orig = target[prop];
    if (typeof orig !== 'function') return null;
    const impl = factory(orig);
    mimic(impl, orig);
    try {
      defineProperty(target, prop, {
        value: impl,
        writable: true,
        enumerable: getOwnPropertyDescriptor(target, prop)?.enumerable ?? false,
        configurable: true,
      });
    } catch (e) {
      return null;
    }
    return orig;
  }

  /**
   * Deterministic 32-bit hash. Same implementation as the Node-side PRNG, so a
   * value computed in the page matches one computed during profile derivation.
   */
  function hash32(a, b, c) {
    let h = 0x811c9dc5 ^ (a | 0);
    h = Math.imul(h ^ ((b | 0) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (((b | 0) >>> 8) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (((b | 0) >>> 16) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ (((b | 0) >>> 24) & 0xff), 0x01000193) >>> 0;
    h = Math.imul(h ^ ((c | 0) & 0xff), 0x01000193) >>> 0;
    return h >>> 0;
  }

  /** Uniform float in [0,1) from the same hash, for dither amplitudes. */
  function hashFloat(a, b, c) {
    return hash32(a, b, c) / 4294967296;
  }

  return freeze({
    markNative,
    mimic,
    defineGetter,
    defineValue,
    replaceMethod,
    hash32,
    hashFloat,
    origToString,
    create,
    getOwnPropertyNames,
  });
}
