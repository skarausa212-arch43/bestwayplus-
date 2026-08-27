/**
 * Device database.
 *
 * Every entry describes one physical Android device + browser build. Values are
 * grouped by the subsystem that exposes them so that a single device edit stays
 * consistent across JS, headers and TLS.
 *
 * Screen invariant: panel.w === round(screen.width * screen.dpr) (same for h,
 * +/-1 for rounding). `npm test` enforces it — a device whose CSS size and DPR
 * disagree with its panel is the single most common way a profile gets caught.
 */

// Chromium reports these regardless of GPU; they are not device-specific.
const CHROMIUM_WEBGL = {
  vendor: 'WebKit',
  renderer: 'WebKit WebGL',
  version: 'WebGL 1.0 (OpenGL ES 2.0 Chromium)',
  shadingLanguageVersion: 'WebGL GLSL ES 1.0 (OpenGL ES GLSL ES 1.0 Chromium)',
  version2: 'WebGL 2.0 (OpenGL ES 3.0 Chromium)',
  shadingLanguageVersion2: 'WebGL GLSL ES 3.00 (OpenGL ES GLSL ES 3.0 Chromium)',
};

// Stock AOSP font set. Present on every Android build; vendors add to it.
const AOSP_FONTS = [
  'Roboto',
  'Roboto Condensed',
  'Noto Sans',
  'Noto Serif',
  'Noto Color Emoji',
  'Droid Sans Mono',
  'Cutive Mono',
  'Coming Soon',
  'Dancing Script',
  'Carrois Gothic SC',
  'sans-serif',
  'serif',
  'monospace',
];

const SAMSUNG_FONTS = [...AOSP_FONTS, 'SamsungOne', 'Samsung Sans', 'SEC CJK'];
const MIUI_FONTS = [...AOSP_FONTS, 'MiSans', 'Mipro'];

/** Adreno GPUs expose Qualcomm's extension set; Mali exposes ARM's. */
const ADRENO_EXTENSIONS = [
  'EXT_color_buffer_float', 'EXT_float_blend', 'EXT_texture_filter_anisotropic',
  'OES_element_index_uint', 'OES_fbo_render_mipmap', 'OES_standard_derivatives',
  'OES_texture_float', 'OES_texture_float_linear', 'OES_texture_half_float',
  'OES_texture_half_float_linear', 'OES_vertex_array_object',
  'WEBGL_compressed_texture_astc', 'WEBGL_compressed_texture_etc',
  'WEBGL_compressed_texture_etc1', 'WEBGL_debug_renderer_info',
  'WEBGL_debug_shaders', 'WEBGL_depth_texture', 'WEBGL_lose_context',
  'ANGLE_instanced_arrays', 'EXT_blend_minmax', 'EXT_frag_depth',
  'EXT_shader_texture_lod', 'EXT_sRGB', 'WEBGL_color_buffer_float',
  'WEBGL_draw_buffers', 'EXT_disjoint_timer_query',
];

const MALI_EXTENSIONS = ADRENO_EXTENSIONS.filter(
  (e) => e !== 'EXT_disjoint_timer_query'
).concat('EXT_texture_compression_rgtc');

const ADRENO_LIMITS = {
  MAX_TEXTURE_SIZE: 16384,
  MAX_CUBE_MAP_TEXTURE_SIZE: 16384,
  MAX_RENDERBUFFER_SIZE: 16384,
  MAX_VIEWPORT_DIMS: [16384, 16384],
  MAX_TEXTURE_IMAGE_UNITS: 16,
  MAX_VERTEX_TEXTURE_IMAGE_UNITS: 16,
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 96,
  MAX_VERTEX_ATTRIBS: 16,
  MAX_VERTEX_UNIFORM_VECTORS: 256,
  MAX_FRAGMENT_UNIFORM_VECTORS: 256,
  MAX_VARYING_VECTORS: 31,
  ALIASED_LINE_WIDTH_RANGE: [1, 8],
  ALIASED_POINT_SIZE_RANGE: [1, 1023],
  MAX_ANISOTROPY: 16,
};

const MALI_LIMITS = {
  ...ADRENO_LIMITS,
  MAX_TEXTURE_SIZE: 8192,
  MAX_CUBE_MAP_TEXTURE_SIZE: 8192,
  MAX_RENDERBUFFER_SIZE: 8192,
  MAX_VIEWPORT_DIMS: [8192, 8192],
  MAX_COMBINED_TEXTURE_IMAGE_UNITS: 32,
  MAX_VARYING_VECTORS: 15,
  ALIASED_POINT_SIZE_RANGE: [1, 511],
};

/** Codec support is uniform across modern Chrome/Android; AV1 varies by SoC. */
const CODECS_BASE = {
  'video/mp4; codecs="avc1.42E01E"': 'probably',
  'video/mp4; codecs="avc1.640028"': 'probably',
  'video/webm; codecs="vp8"': 'probably',
  'video/webm; codecs="vp9"': 'probably',
  'video/mp4; codecs="hev1.1.6.L93.B0"': 'probably',
  'audio/mp4; codecs="mp4a.40.2"': 'probably',
  'audio/webm; codecs="opus"': 'probably',
  'audio/ogg; codecs="vorbis"': 'probably',
  'audio/flac': 'probably',
  'audio/wav; codecs="1"': 'probably',
};

const CODECS_AV1 = { ...CODECS_BASE, 'video/mp4; codecs="av01.0.05M.08"': 'probably' };

/**
 * `audio` holds the DSP identity of the device: Android's AudioFlinger resamples
 * through vendor-specific paths, so the float output of an OfflineAudioContext
 * differs measurably between SoCs. `gain` scales the signal, `dcOffset` shifts
 * it, `noiseFloor` sets the magnitude of the deterministic per-sample dither.
 */
const DSP_QUALCOMM = { gain: 0.9999983310699463, dcOffset: 1.1e-8, noiseFloor: 8e-8 };
const DSP_ARM = { gain: 0.9999977350234985, dcOffset: -0.7e-8, noiseFloor: 6.5e-8 };
const DSP_MEDIATEK = { gain: 0.9999969005584717, dcOffset: 1.9e-8, noiseFloor: 1.1e-7 };

export const DEVICES = [
  {
    id: 'pixel-8-pro',
    name: 'Google Pixel 8 Pro',
    vendor: 'Google',
    model: 'Pixel 8 Pro',
    formFactor: 'mobile',
    android: { version: '14', release: '14', build: 'AP2A.240905.003' },
    browser: { name: 'Chrome', major: 131, full: '131.0.6778.135' },
    screen: { width: 448, height: 997, dpr: 3.0, colorDepth: 24 },
    panel: { w: 1344, h: 2992, ppi: 489 },
    hardware: { cores: 9, memoryGB: 8, soc: 'Google Tensor G3', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'ARM',
      unmaskedRenderer: 'Mali-G715-Immortalis MC11',
      extensions: MALI_EXTENSIONS,
      limits: MALI_LIMITS,
    },
    audio: DSP_ARM,
    fonts: AOSP_FONTS,
    codecs: CODECS_AV1,
    battery: { charging: false, level: 0.78 },
  },
  {
    id: 'pixel-7a',
    name: 'Google Pixel 7a',
    vendor: 'Google',
    model: 'Pixel 7a',
    formFactor: 'mobile',
    android: { version: '14', release: '14', build: 'AP2A.240805.005' },
    browser: { name: 'Chrome', major: 131, full: '131.0.6778.135' },
    screen: { width: 412, height: 915, dpr: 2.625, colorDepth: 24 },
    panel: { w: 1080, h: 2400, ppi: 429 },
    hardware: { cores: 8, memoryGB: 8, soc: 'Google Tensor G2', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'ARM',
      unmaskedRenderer: 'Mali-G710 MC10',
      extensions: MALI_EXTENSIONS,
      limits: MALI_LIMITS,
    },
    audio: DSP_ARM,
    fonts: AOSP_FONTS,
    codecs: CODECS_AV1,
    battery: { charging: true, level: 0.55 },
  },
  {
    id: 'galaxy-s23-ultra',
    name: 'Samsung Galaxy S23 Ultra',
    vendor: 'Samsung',
    model: 'SM-S918B',
    formFactor: 'mobile',
    android: { version: '14', release: '14', build: 'UP1A.231005.007' },
    browser: { name: 'Chrome', major: 131, full: '131.0.6778.135' },
    // FHD+ is the shipping default; the 1440p mode is opt-in.
    screen: { width: 412, height: 892, dpr: 2.625, colorDepth: 24 },
    panel: { w: 1080, h: 2340, ppi: 500 },
    hardware: { cores: 8, memoryGB: 8, soc: 'Snapdragon 8 Gen 2', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'Qualcomm',
      unmaskedRenderer: 'Adreno (TM) 740',
      extensions: ADRENO_EXTENSIONS,
      limits: ADRENO_LIMITS,
    },
    audio: DSP_QUALCOMM,
    fonts: SAMSUNG_FONTS,
    codecs: CODECS_AV1,
    battery: { charging: false, level: 0.64 },
  },
  {
    id: 'galaxy-s24',
    name: 'Samsung Galaxy S24',
    vendor: 'Samsung',
    model: 'SM-S921B',
    formFactor: 'mobile',
    android: { version: '14', release: '14', build: 'UP1A.231005.007' },
    browser: { name: 'Chrome', major: 133, full: '133.0.6943.121' },
    screen: { width: 384, height: 824, dpr: 2.8125, colorDepth: 24 },
    panel: { w: 1080, h: 2317, ppi: 416 },
    hardware: { cores: 10, memoryGB: 8, soc: 'Exynos 2400', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'Samsung',
      unmaskedRenderer: 'Samsung Xclipse 940',
      extensions: ADRENO_EXTENSIONS,
      limits: ADRENO_LIMITS,
    },
    audio: DSP_ARM,
    fonts: SAMSUNG_FONTS,
    codecs: CODECS_AV1,
    battery: { charging: false, level: 0.41 },
  },
  {
    id: 'galaxy-a54',
    name: 'Samsung Galaxy A54 5G',
    vendor: 'Samsung',
    model: 'SM-A546B',
    formFactor: 'mobile',
    android: { version: '14', release: '14', build: 'UP1A.231005.007' },
    browser: { name: 'Chrome', major: 131, full: '131.0.6778.135' },
    screen: { width: 384, height: 854, dpr: 2.8125, colorDepth: 24 },
    panel: { w: 1080, h: 2402, ppi: 403 },
    hardware: { cores: 8, memoryGB: 4, soc: 'Exynos 1380', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'ARM',
      unmaskedRenderer: 'Mali-G68 MC4',
      extensions: MALI_EXTENSIONS,
      limits: MALI_LIMITS,
    },
    audio: DSP_ARM,
    fonts: SAMSUNG_FONTS,
    codecs: CODECS_BASE,
    battery: { charging: false, level: 0.33 },
  },
  {
    id: 'xiaomi-13',
    name: 'Xiaomi 13',
    vendor: 'Xiaomi',
    model: '2211133C',
    formFactor: 'mobile',
    android: { version: '14', release: '14', build: 'UKQ1.230804.001' },
    browser: { name: 'Chrome', major: 131, full: '131.0.6778.135' },
    screen: { width: 393, height: 851, dpr: 2.75, colorDepth: 24 },
    panel: { w: 1080, h: 2340, ppi: 414 },
    hardware: { cores: 8, memoryGB: 8, soc: 'Snapdragon 8 Gen 2', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'Qualcomm',
      unmaskedRenderer: 'Adreno (TM) 740',
      extensions: ADRENO_EXTENSIONS,
      limits: ADRENO_LIMITS,
    },
    audio: DSP_QUALCOMM,
    fonts: MIUI_FONTS,
    codecs: CODECS_AV1,
    battery: { charging: true, level: 0.92 },
  },
  {
    id: 'redmi-note-12',
    name: 'Xiaomi Redmi Note 12',
    vendor: 'Xiaomi',
    model: '23021RAAEG',
    formFactor: 'mobile',
    android: { version: '13', release: '13', build: 'TKQ1.221114.001' },
    browser: { name: 'Chrome', major: 120, full: '120.0.6099.230' },
    screen: { width: 393, height: 873, dpr: 2.75, colorDepth: 24 },
    panel: { w: 1080, h: 2400, ppi: 395 },
    hardware: { cores: 8, memoryGB: 4, soc: 'Snapdragon 685', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'Qualcomm',
      unmaskedRenderer: 'Adreno (TM) 610',
      extensions: ADRENO_EXTENSIONS.filter((e) => e !== 'EXT_disjoint_timer_query'),
      limits: { ...ADRENO_LIMITS, MAX_TEXTURE_SIZE: 8192, MAX_RENDERBUFFER_SIZE: 8192, MAX_VIEWPORT_DIMS: [8192, 8192] },
    },
    audio: DSP_QUALCOMM,
    fonts: MIUI_FONTS,
    codecs: CODECS_BASE,
    battery: { charging: false, level: 0.27 },
  },
  {
    id: 'oneplus-11',
    name: 'OnePlus 11',
    vendor: 'OnePlus',
    model: 'CPH2449',
    formFactor: 'mobile',
    android: { version: '14', release: '14', build: 'UKQ1.230924.001' },
    browser: { name: 'Chrome', major: 133, full: '133.0.6943.121' },
    screen: { width: 412, height: 919, dpr: 3.5, colorDepth: 24 },
    panel: { w: 1440, h: 3216, ppi: 525 },
    hardware: { cores: 8, memoryGB: 8, soc: 'Snapdragon 8 Gen 2', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'Qualcomm',
      unmaskedRenderer: 'Adreno (TM) 740',
      extensions: ADRENO_EXTENSIONS,
      limits: ADRENO_LIMITS,
    },
    audio: DSP_QUALCOMM,
    fonts: AOSP_FONTS,
    codecs: CODECS_AV1,
    battery: { charging: false, level: 0.71 },
  },
  {
    id: 'galaxy-tab-s9',
    name: 'Samsung Galaxy Tab S9',
    vendor: 'Samsung',
    model: 'SM-X710',
    // Tablets drop the "Mobile" UA token and report hover-capable pointers
    // differently; this is the classic slip when emulating one.
    formFactor: 'tablet',
    android: { version: '14', release: '14', build: 'UP1A.231005.007' },
    browser: { name: 'Chrome', major: 131, full: '131.0.6778.135' },
    screen: { width: 800, height: 1280, dpr: 2.0, colorDepth: 24 },
    panel: { w: 1600, h: 2560, ppi: 274 },
    hardware: { cores: 8, memoryGB: 8, soc: 'Snapdragon 8 Gen 2', touchPoints: 10 },
    gpu: {
      unmaskedVendor: 'Qualcomm',
      unmaskedRenderer: 'Adreno (TM) 740',
      extensions: ADRENO_EXTENSIONS,
      limits: ADRENO_LIMITS,
    },
    audio: DSP_QUALCOMM,
    fonts: SAMSUNG_FONTS,
    codecs: CODECS_AV1,
    battery: { charging: true, level: 0.88 },
  },
  {
    id: 'moto-g84',
    name: 'Motorola Moto G84',
    vendor: 'Motorola',
    model: 'moto g84 5G',
    formFactor: 'mobile',
    android: { version: '13', release: '13', build: 'T1TB33.53-16' },
    browser: { name: 'Chrome', major: 131, full: '131.0.6778.135' },
    screen: { width: 393, height: 873, dpr: 2.75, colorDepth: 24 },
    panel: { w: 1080, h: 2400, ppi: 402 },
    hardware: { cores: 8, memoryGB: 8, soc: 'Snapdragon 695', touchPoints: 5 },
    gpu: {
      unmaskedVendor: 'Qualcomm',
      unmaskedRenderer: 'Adreno (TM) 619',
      extensions: ADRENO_EXTENSIONS,
      limits: { ...ADRENO_LIMITS, MAX_TEXTURE_SIZE: 8192, MAX_RENDERBUFFER_SIZE: 8192, MAX_VIEWPORT_DIMS: [8192, 8192] },
    },
    audio: DSP_MEDIATEK,
    fonts: AOSP_FONTS,
    codecs: CODECS_BASE,
    battery: { charging: false, level: 0.5 },
  },
];

export { CHROMIUM_WEBGL, AOSP_FONTS, SAMSUNG_FONTS, MIUI_FONTS };

export function listDevices() {
  return DEVICES.map((d) => ({ id: d.id, name: d.name, formFactor: d.formFactor }));
}

export function getDevice(id) {
  const d = DEVICES.find((x) => x.id === id);
  if (!d) {
    throw new Error(
      `Unknown device "${id}". Known: ${DEVICES.map((x) => x.id).join(', ')}`
    );
  }
  return d;
}
