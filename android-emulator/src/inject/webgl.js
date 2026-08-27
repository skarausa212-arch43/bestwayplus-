/**
 * WebGL 1 and 2. Runs inside the page.
 *
 * Two separate things are being emulated here and they are often confused:
 * the *strings* (VENDOR / RENDERER / UNMASKED_*) and the *capabilities*
 * (MAX_TEXTURE_SIZE, extension list, shader precision). Claiming an
 * "Adreno (TM) 740" while reporting the host's real 4096-texel limit and the
 * host's desktop extension list is a contradiction any serious fingerprinter
 * checks for, so both move together.
 */
export function patchWebGL(cfg, nat) {
  const gl = cfg.js.webgl;
  const seed = cfg.js.canvas.seed >>> 0;

  const P = {
    VENDOR: 0x1f00,
    RENDERER: 0x1f01,
    VERSION: 0x1f02,
    SHADING_LANGUAGE_VERSION: 0x8b8c,
    UNMASKED_VENDOR_WEBGL: 0x9245,
    UNMASKED_RENDERER_WEBGL: 0x9246,
    MAX_TEXTURE_SIZE: 0x0d33,
    MAX_CUBE_MAP_TEXTURE_SIZE: 0x851c,
    MAX_RENDERBUFFER_SIZE: 0x84e8,
    MAX_VIEWPORT_DIMS: 0x0d3a,
    MAX_TEXTURE_IMAGE_UNITS: 0x8872,
    MAX_VERTEX_TEXTURE_IMAGE_UNITS: 0x8b4c,
    MAX_COMBINED_TEXTURE_IMAGE_UNITS: 0x8b4d,
    MAX_VERTEX_ATTRIBS: 0x8869,
    MAX_VERTEX_UNIFORM_VECTORS: 0x8dfb,
    MAX_FRAGMENT_UNIFORM_VECTORS: 0x8dfd,
    MAX_VARYING_VECTORS: 0x8dfc,
    ALIASED_LINE_WIDTH_RANGE: 0x846e,
    ALIASED_POINT_SIZE_RANGE: 0x846d,
    MAX_TEXTURE_MAX_ANISOTROPY_EXT: 0x84ff,
  };

  const L = gl.limits;

  /** pname -> value. Typed arrays must keep their exact types: a plain Array
   *  where Chrome returns an Int32Array is a free detection. */
  const OVERRIDES = new Map([
    [P.VENDOR, gl.vendor],
    [P.RENDERER, gl.renderer],
    [P.UNMASKED_VENDOR_WEBGL, gl.unmaskedVendor],
    [P.UNMASKED_RENDERER_WEBGL, gl.unmaskedRenderer],
    [P.MAX_TEXTURE_SIZE, L.MAX_TEXTURE_SIZE],
    [P.MAX_CUBE_MAP_TEXTURE_SIZE, L.MAX_CUBE_MAP_TEXTURE_SIZE],
    [P.MAX_RENDERBUFFER_SIZE, L.MAX_RENDERBUFFER_SIZE],
    [P.MAX_VIEWPORT_DIMS, () => new Int32Array(L.MAX_VIEWPORT_DIMS)],
    [P.MAX_TEXTURE_IMAGE_UNITS, L.MAX_TEXTURE_IMAGE_UNITS],
    [P.MAX_VERTEX_TEXTURE_IMAGE_UNITS, L.MAX_VERTEX_TEXTURE_IMAGE_UNITS],
    [P.MAX_COMBINED_TEXTURE_IMAGE_UNITS, L.MAX_COMBINED_TEXTURE_IMAGE_UNITS],
    [P.MAX_VERTEX_ATTRIBS, L.MAX_VERTEX_ATTRIBS],
    [P.MAX_VERTEX_UNIFORM_VECTORS, L.MAX_VERTEX_UNIFORM_VECTORS],
    [P.MAX_FRAGMENT_UNIFORM_VECTORS, L.MAX_FRAGMENT_UNIFORM_VECTORS],
    [P.MAX_VARYING_VECTORS, L.MAX_VARYING_VECTORS],
    [P.ALIASED_LINE_WIDTH_RANGE, () => new Float32Array(L.ALIASED_LINE_WIDTH_RANGE)],
    [P.ALIASED_POINT_SIZE_RANGE, () => new Float32Array(L.ALIASED_POINT_SIZE_RANGE)],
    [P.MAX_TEXTURE_MAX_ANISOTROPY_EXT, L.MAX_ANISOTROPY],
  ]);

  /**
   * GLES 2.0 shader precision as reported by every mainstream mobile GPU.
   * Desktop GL reports 127/127/23 for low and medium float too, so leaving the
   * host's values in place would contradict the claimed Adreno/Mali.
   */
  const PRECISION = {
    LOW_FLOAT: { rangeMin: 15, rangeMax: 15, precision: 10 },
    MEDIUM_FLOAT: { rangeMin: 15, rangeMax: 15, precision: 10 },
    HIGH_FLOAT: { rangeMin: 127, rangeMax: 127, precision: 23 },
    LOW_INT: { rangeMin: 15, rangeMax: 14, precision: 0 },
    MEDIUM_INT: { rangeMin: 15, rangeMax: 14, precision: 0 },
    HIGH_INT: { rangeMin: 31, rangeMax: 30, precision: 0 },
  };
  const PRECISION_BY_ENUM = {
    0x8df0: PRECISION.LOW_FLOAT,
    0x8df1: PRECISION.MEDIUM_FLOAT,
    0x8df2: PRECISION.HIGH_FLOAT,
    0x8df3: PRECISION.LOW_INT,
    0x8df4: PRECISION.MEDIUM_INT,
    0x8df5: PRECISION.HIGH_INT,
  };

  const supported = gl.extensions.slice();
  const supportedSet = new Set(supported);

  function patchContext(Ctor, isV2) {
    if (!Ctor) return;
    const proto = Ctor.prototype;

    nat.replaceMethod(proto, 'getParameter', (orig) => function getParameter(pname) {
      if (pname === P.VERSION) return isV2 ? gl.version2 : gl.version;
      if (pname === P.SHADING_LANGUAGE_VERSION) {
        return isV2 ? gl.shadingLanguageVersion2 : gl.shadingLanguageVersion;
      }
      if (OVERRIDES.has(pname)) {
        const v = OVERRIDES.get(pname);
        return typeof v === 'function' ? v() : v;
      }
      return orig.call(this, pname);
    });

    nat.replaceMethod(proto, 'getSupportedExtensions', () =>
      function getSupportedExtensions() {
        return supported.slice();
      }
    );

    // An extension we claim not to support must also fail to be fetched, and
    // one we claim to support must not vanish because the host lacks it.
    nat.replaceMethod(proto, 'getExtension', (orig) => function getExtension(name) {
      if (typeof name === 'string' && !supportedSet.has(name)) return null;
      return orig.call(this, name);
    });

    nat.replaceMethod(proto, 'getShaderPrecisionFormat', (orig) =>
      function getShaderPrecisionFormat(shaderType, precisionType) {
        const out = orig.call(this, shaderType, precisionType);
        const want = PRECISION_BY_ENUM[precisionType];
        if (out && want) {
          for (const k of ['rangeMin', 'rangeMax', 'precision']) {
            try {
              Object.defineProperty(out, k, {
                get: nat.markNative(function () { return want[k]; }, `get ${k}`),
                configurable: true,
              });
            } catch (e) { /* ignore */ }
          }
        }
        return out;
      }
    );

    // Same dither as canvas: GPU rasterization differs per device, and
    // readPixels is how the WebGL-image fingerprints are actually collected.
    nat.replaceMethod(proto, 'readPixels', (orig) =>
      function readPixels(x, y, width, height, format, type, pixels, offset) {
        const r = arguments.length > 7
          ? orig.call(this, x, y, width, height, format, type, pixels, offset)
          : orig.call(this, x, y, width, height, format, type, pixels);
        try {
          if (pixels && pixels.BYTES_PER_ELEMENT === 1 && pixels.length >= 4) {
            const d = pixels;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] === 0) continue;
              const p = i >> 2;
              for (let c = 0; c < 3; c++) {
                const v = d[i + c];
                const k = nat.hash32(seed, p, (c << 8) | v) % 6;
                if (k === 0) { if (v > 0) d[i + c] = v - 1; }
                else if (k === 1) { if (v < 255) d[i + c] = v + 1; }
              }
            }
          }
        } catch (e) { /* ignore */ }
        return r;
      }
    );
  }

  patchContext(window.WebGLRenderingContext, false);
  patchContext(window.WebGL2RenderingContext, true);

  // WEBGL_debug_renderer_info is what most scripts actually read. If the host
  // build hides it, the claimed GPU would be unreachable, so re-expose the two
  // constants the extension is made of.
  try {
    if (window.WebGLRenderingContext && !supportedSet.has('WEBGL_debug_renderer_info')) {
      supported.push('WEBGL_debug_renderer_info');
      supportedSet.add('WEBGL_debug_renderer_info');
    }
  } catch (e) { /* ignore */ }
}
