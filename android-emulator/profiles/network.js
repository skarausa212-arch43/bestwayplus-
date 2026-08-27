import { LOCALES, acceptLanguageFor, isValidTimezone } from './locales.js';

export { LOCALES, TIMEZONES, ALL_TIMEZONES, isValidTimezone } from './locales.js';

/**
 * Header-order and TLS profile data.
 *
 * The rule this file exists to enforce: a device's *network* identity and its
 * *JS* identity are one identity. If `Intl` says Europe/Warsaw the egress IP
 * should geolocate to Poland and `accept-language` should lead with `pl`.
 */

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
  // acceptLanguage is derived, never stored: a header that disagrees with
  // navigator.languages is one of the cheapest contradictions to detect.
  return { tag, ...l, acceptLanguage: acceptLanguageFor(l.languages) };
}
