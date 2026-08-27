/**
 * Locale, header-order and TLS profile data.
 *
 * The rule this file exists to enforce: a device's *network* identity and its
 * *JS* identity are one identity. If `Intl` says Europe/Warsaw the egress IP
 * should geolocate to Poland and `accept-language` should lead with `pl`.
 */

/**
 * Locale presets. `languages` is what `navigator.languages` returns;
 * `acceptLanguage` is the header Chrome derives from it — note the q-values and
 * the fact that Chrome appends the bare language subtag.
 */
export const LOCALES = {
  'ru-RU': {
    languages: ['ru-RU', 'ru', 'en-US', 'en'],
    acceptLanguage: 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    timezone: 'Europe/Moscow',
    country: 'RU',
    currency: 'RUB',
  },
  'en-US': {
    languages: ['en-US', 'en'],
    acceptLanguage: 'en-US,en;q=0.9',
    timezone: 'America/New_York',
    country: 'US',
    currency: 'USD',
  },
  'en-GB': {
    languages: ['en-GB', 'en'],
    acceptLanguage: 'en-GB,en;q=0.9',
    timezone: 'Europe/London',
    country: 'GB',
    currency: 'GBP',
  },
  'de-DE': {
    languages: ['de-DE', 'de', 'en-US', 'en'],
    acceptLanguage: 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    timezone: 'Europe/Berlin',
    country: 'DE',
    currency: 'EUR',
  },
  'pl-PL': {
    languages: ['pl-PL', 'pl', 'en-US', 'en'],
    acceptLanguage: 'pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7',
    timezone: 'Europe/Warsaw',
    country: 'PL',
    currency: 'PLN',
  },
  'tr-TR': {
    languages: ['tr-TR', 'tr', 'en-US', 'en'],
    acceptLanguage: 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    timezone: 'Europe/Istanbul',
    country: 'TR',
    currency: 'TRY',
  },
  'pt-BR': {
    languages: ['pt-BR', 'pt', 'en-US', 'en'],
    acceptLanguage: 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    timezone: 'America/Sao_Paulo',
    country: 'BR',
    currency: 'BRL',
  },
  'es-ES': {
    languages: ['es-ES', 'es', 'en-US', 'en'],
    acceptLanguage: 'es-ES,es;q=0.9,en-US;q=0.8,en;q=0.7',
    timezone: 'Europe/Madrid',
    country: 'ES',
    currency: 'EUR',
  },
  'id-ID': {
    languages: ['id-ID', 'id', 'en-US', 'en'],
    acceptLanguage: 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
    timezone: 'Asia/Jakarta',
    country: 'ID',
    currency: 'IDR',
  },
  'hi-IN': {
    languages: ['hi-IN', 'hi', 'en-IN', 'en'],
    acceptLanguage: 'hi-IN,hi;q=0.9,en-IN;q=0.8,en;q=0.7',
    timezone: 'Asia/Kolkata',
    country: 'IN',
    currency: 'INR',
  },
};

/**
 * Chrome/Android header order, per request type. Order is part of the
 * fingerprint: header *names* are trivially copied, the sequence is what most
 * naive clients get wrong. Names absent from a given request are skipped, and
 * anything not listed is appended in insertion order.
 */
export const HEADER_ORDER = {
  // HTTP/2 pseudo-headers. Chrome's order differs from Firefox's and Safari's.
  h2Pseudo: [':method', ':authority', ':scheme', ':path'],

  navigation: [
    'host',
    'connection',
    'cache-control',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'sec-ch-ua-platform',
    'upgrade-insecure-requests',
    'user-agent',
    'accept',
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-user',
    'sec-fetch-dest',
    'referer',
    'accept-encoding',
    'accept-language',
    'cookie',
  ],

  xhr: [
    'host',
    'connection',
    'sec-ch-ua',
    'content-length',
    'sec-ch-ua-mobile',
    'user-agent',
    'content-type',
    'sec-ch-ua-platform',
    'accept',
    'origin',
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-dest',
    'referer',
    'accept-encoding',
    'accept-language',
    'cookie',
  ],

  subresource: [
    'host',
    'connection',
    'sec-ch-ua',
    'sec-ch-ua-mobile',
    'user-agent',
    'sec-ch-ua-platform',
    'accept',
    'sec-fetch-site',
    'sec-fetch-mode',
    'sec-fetch-dest',
    'referer',
    'accept-encoding',
    'accept-language',
    'cookie',
  ],
};

/** `Accept` values Chrome sends per destination. */
export const ACCEPT = {
  navigation:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
  image: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  style: 'text/css,*/*;q=0.1',
  script: '*/*',
  xhr: '*/*',
  font: '*/*',
};

/**
 * Maps a Chrome major version to the uTLS ClientHello template that reproduces
 * its handshake byte-for-byte. Only versions uTLS actually ships are listed —
 * a UA claiming a version with no matching handshake is a contradiction the
 * whole design exists to avoid, so `resolveTlsProfile` refuses to guess.
 */
export const TLS_PROFILES = {
  120: { utls: 'HelloChrome_120', notes: 'Chrome 120, pre-post-quantum key share.' },
  131: { utls: 'HelloChrome_131', notes: 'Chrome 131, X25519MLKEM768 hybrid key share.' },
  133: { utls: 'HelloChrome_133', notes: 'Chrome 133, current shuffle + PQ key share.' },
};

export function resolveTlsProfile(chromeMajor) {
  const p = TLS_PROFILES[chromeMajor];
  if (!p) {
    throw new Error(
      `No uTLS ClientHello template for Chrome ${chromeMajor}. ` +
        `Available: ${Object.keys(TLS_PROFILES).join(', ')}. ` +
        `Pick a device on one of those builds rather than shipping a UA whose ` +
        `TLS handshake belongs to a different Chrome.`
    );
  }
  return { chromeMajor, ...p };
}

export function getLocale(tag) {
  const l = LOCALES[tag];
  if (!l) {
    throw new Error(
      `Unknown locale "${tag}". Known: ${Object.keys(LOCALES).join(', ')}`
    );
  }
  return { tag, ...l };
}
