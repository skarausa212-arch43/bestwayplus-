/**
 * Locales, timezones and the coordinates that go with them.
 *
 * A locale here is not just a language tag: it carries the timezone, the
 * Accept-Language header Chrome derives from the language list, the expected
 * egress country, and a plausible position. Those travel together because a
 * site can compare them. `Intl` saying Europe/Warsaw while the IP geolocates to
 * Brazil and geolocation returns Tokyo is three contradictions, and each one is
 * cheaper for a fingerprinter to check than any of the graphics work.
 *
 * `geo` is a city centre, not a precise address, with an accuracy radius that
 * matches what a phone on wifi actually reports. A suspiciously exact fix is
 * its own anomaly — real devices are rarely accurate to the metre.
 */
export const LOCALES = {
  // ---- CIS ---------------------------------------------------------------
  'ru-RU': {
    languages: ['ru-RU', 'ru', 'en-US', 'en'],
    timezone: 'Europe/Moscow',
    country: 'RU',
    currency: 'RUB',
    geo: { latitude: 55.7558, longitude: 37.6173, accuracy: 45 },
  },
  'ru-KZ': {
    languages: ['ru-RU', 'ru', 'kk-KZ', 'en-US', 'en'],
    timezone: 'Asia/Almaty',
    country: 'KZ',
    currency: 'KZT',
    geo: { latitude: 43.2389, longitude: 76.8897, accuracy: 50 },
  },
  'uk-UA': {
    languages: ['uk-UA', 'uk', 'ru', 'en-US', 'en'],
    timezone: 'Europe/Kyiv',
    country: 'UA',
    currency: 'UAH',
    geo: { latitude: 50.4501, longitude: 30.5234, accuracy: 40 },
  },
  'be-BY': {
    languages: ['ru-RU', 'ru', 'be-BY', 'en-US', 'en'],
    timezone: 'Europe/Minsk',
    country: 'BY',
    currency: 'BYN',
    geo: { latitude: 53.9006, longitude: 27.559, accuracy: 45 },
  },

  // ---- Europe ------------------------------------------------------------
  'en-GB': {
    languages: ['en-GB', 'en'],
    timezone: 'Europe/London',
    country: 'GB',
    currency: 'GBP',
    geo: { latitude: 51.5072, longitude: -0.1276, accuracy: 35 },
  },
  'de-DE': {
    languages: ['de-DE', 'de', 'en-US', 'en'],
    timezone: 'Europe/Berlin',
    country: 'DE',
    currency: 'EUR',
    geo: { latitude: 52.52, longitude: 13.405, accuracy: 40 },
  },
  'fr-FR': {
    languages: ['fr-FR', 'fr', 'en-US', 'en'],
    timezone: 'Europe/Paris',
    country: 'FR',
    currency: 'EUR',
    geo: { latitude: 48.8566, longitude: 2.3522, accuracy: 40 },
  },
  'es-ES': {
    languages: ['es-ES', 'es', 'en-US', 'en'],
    timezone: 'Europe/Madrid',
    country: 'ES',
    currency: 'EUR',
    geo: { latitude: 40.4168, longitude: -3.7038, accuracy: 45 },
  },
  'it-IT': {
    languages: ['it-IT', 'it', 'en-US', 'en'],
    timezone: 'Europe/Rome',
    country: 'IT',
    currency: 'EUR',
    geo: { latitude: 41.9028, longitude: 12.4964, accuracy: 45 },
  },
  'pl-PL': {
    languages: ['pl-PL', 'pl', 'en-US', 'en'],
    timezone: 'Europe/Warsaw',
    country: 'PL',
    currency: 'PLN',
    geo: { latitude: 52.2297, longitude: 21.0122, accuracy: 40 },
  },
  'nl-NL': {
    languages: ['nl-NL', 'nl', 'en-US', 'en'],
    timezone: 'Europe/Amsterdam',
    country: 'NL',
    currency: 'EUR',
    geo: { latitude: 52.3676, longitude: 4.9041, accuracy: 35 },
  },
  'pt-PT': {
    languages: ['pt-PT', 'pt', 'en-US', 'en'],
    timezone: 'Europe/Lisbon',
    country: 'PT',
    currency: 'EUR',
    geo: { latitude: 38.7223, longitude: -9.1393, accuracy: 45 },
  },
  'cs-CZ': {
    languages: ['cs-CZ', 'cs', 'en-US', 'en'],
    timezone: 'Europe/Prague',
    country: 'CZ',
    currency: 'CZK',
    geo: { latitude: 50.0755, longitude: 14.4378, accuracy: 40 },
  },
  'ro-RO': {
    languages: ['ro-RO', 'ro', 'en-US', 'en'],
    timezone: 'Europe/Bucharest',
    country: 'RO',
    currency: 'RON',
    geo: { latitude: 44.4268, longitude: 26.1025, accuracy: 45 },
  },
  'sv-SE': {
    languages: ['sv-SE', 'sv', 'en-US', 'en'],
    timezone: 'Europe/Stockholm',
    country: 'SE',
    currency: 'SEK',
    geo: { latitude: 59.3293, longitude: 18.0686, accuracy: 40 },
  },
  'da-DK': {
    languages: ['da-DK', 'da', 'en-US', 'en'],
    timezone: 'Europe/Copenhagen',
    country: 'DK',
    currency: 'DKK',
    geo: { latitude: 55.6761, longitude: 12.5683, accuracy: 40 },
  },
  'fi-FI': {
    languages: ['fi-FI', 'fi', 'en-US', 'en'],
    timezone: 'Europe/Helsinki',
    country: 'FI',
    currency: 'EUR',
    geo: { latitude: 60.1699, longitude: 24.9384, accuracy: 45 },
  },
  'no-NO': {
    languages: ['nb-NO', 'nb', 'no', 'en-US', 'en'],
    timezone: 'Europe/Oslo',
    country: 'NO',
    currency: 'NOK',
    geo: { latitude: 59.9139, longitude: 10.7522, accuracy: 40 },
  },
  'el-GR': {
    languages: ['el-GR', 'el', 'en-US', 'en'],
    timezone: 'Europe/Athens',
    country: 'GR',
    currency: 'EUR',
    geo: { latitude: 37.9838, longitude: 23.7275, accuracy: 50 },
  },
  'hu-HU': {
    languages: ['hu-HU', 'hu', 'en-US', 'en'],
    timezone: 'Europe/Budapest',
    country: 'HU',
    currency: 'HUF',
    geo: { latitude: 47.4979, longitude: 19.0402, accuracy: 45 },
  },
  'tr-TR': {
    languages: ['tr-TR', 'tr', 'en-US', 'en'],
    timezone: 'Europe/Istanbul',
    country: 'TR',
    currency: 'TRY',
    geo: { latitude: 41.0082, longitude: 28.9784, accuracy: 50 },
  },

  // ---- Americas ----------------------------------------------------------
  'en-US': {
    languages: ['en-US', 'en'],
    timezone: 'America/New_York',
    country: 'US',
    currency: 'USD',
    geo: { latitude: 40.7128, longitude: -74.006, accuracy: 35 },
  },
  'en-US-LA': {
    languages: ['en-US', 'en'],
    timezone: 'America/Los_Angeles',
    country: 'US',
    currency: 'USD',
    geo: { latitude: 34.0522, longitude: -118.2437, accuracy: 40 },
  },
  'en-US-CHI': {
    languages: ['en-US', 'en'],
    timezone: 'America/Chicago',
    country: 'US',
    currency: 'USD',
    geo: { latitude: 41.8781, longitude: -87.6298, accuracy: 40 },
  },
  'en-CA': {
    languages: ['en-CA', 'en', 'fr-CA', 'fr'],
    timezone: 'America/Toronto',
    country: 'CA',
    currency: 'CAD',
    geo: { latitude: 43.6532, longitude: -79.3832, accuracy: 40 },
  },
  'es-MX': {
    languages: ['es-MX', 'es', 'en-US', 'en'],
    timezone: 'America/Mexico_City',
    country: 'MX',
    currency: 'MXN',
    geo: { latitude: 19.4326, longitude: -99.1332, accuracy: 50 },
  },
  'pt-BR': {
    languages: ['pt-BR', 'pt', 'en-US', 'en'],
    timezone: 'America/Sao_Paulo',
    country: 'BR',
    currency: 'BRL',
    geo: { latitude: -23.5505, longitude: -46.6333, accuracy: 50 },
  },
  'es-AR': {
    languages: ['es-AR', 'es', 'en-US', 'en'],
    timezone: 'America/Argentina/Buenos_Aires',
    country: 'AR',
    currency: 'ARS',
    geo: { latitude: -34.6037, longitude: -58.3816, accuracy: 50 },
  },
  'es-CO': {
    languages: ['es-CO', 'es', 'en-US', 'en'],
    timezone: 'America/Bogota',
    country: 'CO',
    currency: 'COP',
    geo: { latitude: 4.711, longitude: -74.0721, accuracy: 55 },
  },

  // ---- Asia & Pacific ----------------------------------------------------
  'ja-JP': {
    languages: ['ja-JP', 'ja', 'en-US', 'en'],
    timezone: 'Asia/Tokyo',
    country: 'JP',
    currency: 'JPY',
    geo: { latitude: 35.6762, longitude: 139.6503, accuracy: 35 },
  },
  'ko-KR': {
    languages: ['ko-KR', 'ko', 'en-US', 'en'],
    timezone: 'Asia/Seoul',
    country: 'KR',
    currency: 'KRW',
    geo: { latitude: 37.5665, longitude: 126.978, accuracy: 35 },
  },
  'zh-TW': {
    languages: ['zh-TW', 'zh', 'en-US', 'en'],
    timezone: 'Asia/Taipei',
    country: 'TW',
    currency: 'TWD',
    geo: { latitude: 25.033, longitude: 121.5654, accuracy: 40 },
  },
  'hi-IN': {
    languages: ['hi-IN', 'hi', 'en-IN', 'en'],
    timezone: 'Asia/Kolkata',
    country: 'IN',
    currency: 'INR',
    geo: { latitude: 28.6139, longitude: 77.209, accuracy: 55 },
  },
  'id-ID': {
    languages: ['id-ID', 'id', 'en-US', 'en'],
    timezone: 'Asia/Jakarta',
    country: 'ID',
    currency: 'IDR',
    geo: { latitude: -6.2088, longitude: 106.8456, accuracy: 55 },
  },
  'th-TH': {
    languages: ['th-TH', 'th', 'en-US', 'en'],
    timezone: 'Asia/Bangkok',
    country: 'TH',
    currency: 'THB',
    geo: { latitude: 13.7563, longitude: 100.5018, accuracy: 50 },
  },
  'vi-VN': {
    languages: ['vi-VN', 'vi', 'en-US', 'en'],
    timezone: 'Asia/Ho_Chi_Minh',
    country: 'VN',
    currency: 'VND',
    geo: { latitude: 10.8231, longitude: 106.6297, accuracy: 55 },
  },
  'ms-MY': {
    languages: ['ms-MY', 'ms', 'en-US', 'en'],
    timezone: 'Asia/Kuala_Lumpur',
    country: 'MY',
    currency: 'MYR',
    geo: { latitude: 3.139, longitude: 101.6869, accuracy: 50 },
  },
  'en-PH': {
    languages: ['en-PH', 'en', 'fil-PH', 'fil'],
    timezone: 'Asia/Manila',
    country: 'PH',
    currency: 'PHP',
    geo: { latitude: 14.5995, longitude: 120.9842, accuracy: 55 },
  },
  'en-SG': {
    languages: ['en-SG', 'en', 'zh-CN', 'zh'],
    timezone: 'Asia/Singapore',
    country: 'SG',
    currency: 'SGD',
    geo: { latitude: 1.3521, longitude: 103.8198, accuracy: 35 },
  },
  'en-AU': {
    languages: ['en-AU', 'en'],
    timezone: 'Australia/Sydney',
    country: 'AU',
    currency: 'AUD',
    geo: { latitude: -33.8688, longitude: 151.2093, accuracy: 40 },
  },
  'en-NZ': {
    languages: ['en-NZ', 'en'],
    timezone: 'Pacific/Auckland',
    country: 'NZ',
    currency: 'NZD',
    geo: { latitude: -36.8485, longitude: 174.7633, accuracy: 45 },
  },

  // ---- Middle East & Africa ---------------------------------------------
  'ar-AE': {
    languages: ['ar-AE', 'ar', 'en-US', 'en'],
    timezone: 'Asia/Dubai',
    country: 'AE',
    currency: 'AED',
    geo: { latitude: 25.2048, longitude: 55.2708, accuracy: 45 },
  },
  'ar-SA': {
    languages: ['ar-SA', 'ar', 'en-US', 'en'],
    timezone: 'Asia/Riyadh',
    country: 'SA',
    currency: 'SAR',
    geo: { latitude: 24.7136, longitude: 46.6753, accuracy: 50 },
  },
  'he-IL': {
    languages: ['he-IL', 'he', 'en-US', 'en'],
    timezone: 'Asia/Jerusalem',
    country: 'IL',
    currency: 'ILS',
    geo: { latitude: 32.0853, longitude: 34.7818, accuracy: 40 },
  },
  'en-ZA': {
    languages: ['en-ZA', 'en'],
    timezone: 'Africa/Johannesburg',
    country: 'ZA',
    currency: 'ZAR',
    geo: { latitude: -26.2041, longitude: 28.0473, accuracy: 55 },
  },
  'en-NG': {
    languages: ['en-NG', 'en'],
    timezone: 'Africa/Lagos',
    country: 'NG',
    currency: 'NGN',
    geo: { latitude: 6.5244, longitude: 3.3792, accuracy: 60 },
  },
  'ar-EG': {
    languages: ['ar-EG', 'ar', 'en-US', 'en'],
    timezone: 'Africa/Cairo',
    country: 'EG',
    currency: 'EGP',
    geo: { latitude: 30.0444, longitude: 31.2357, accuracy: 55 },
  },
};

/**
 * Chrome builds Accept-Language from navigator.languages: the full list, then
 * descending q-values in 0.1 steps, and the leading entry carries no q at all.
 * Deriving it rather than storing it keeps the header and the JS array from
 * ever disagreeing — which is the exact contradiction this whole project is
 * organised to avoid.
 */
export function acceptLanguageFor(languages) {
  return languages
    .map((lang, i) => (i === 0 ? lang : `${lang};q=${(1 - i * 0.1).toFixed(1)}`))
    .join(',');
}

/**
 * Timezones offered independently of the locale, because the two are genuinely
 * independent in life: a Russian-speaking phone in Warsaw is ordinary. Grouped
 * for the picker; every entry is a real IANA zone Chrome accepts.
 */
export const TIMEZONES = {
  'Европа': [
    'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Madrid',
    'Europe/Paris', 'Europe/Brussels', 'Europe/Amsterdam', 'Europe/Berlin',
    'Europe/Zurich', 'Europe/Vienna', 'Europe/Rome', 'Europe/Prague',
    'Europe/Warsaw', 'Europe/Budapest', 'Europe/Bratislava', 'Europe/Ljubljana',
    'Europe/Zagreb', 'Europe/Belgrade', 'Europe/Sarajevo', 'Europe/Skopje',
    'Europe/Tirane', 'Europe/Sofia', 'Europe/Bucharest', 'Europe/Chisinau',
    'Europe/Athens', 'Europe/Istanbul', 'Europe/Kyiv', 'Europe/Minsk',
    'Europe/Riga', 'Europe/Vilnius', 'Europe/Tallinn', 'Europe/Helsinki',
    'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Atlantic/Reykjavik',
    'Europe/Moscow', 'Europe/Samara', 'Europe/Kaliningrad', 'Europe/Malta',
  ],
  'Азия': [
    'Asia/Almaty', 'Asia/Aqtobe', 'Asia/Tashkent', 'Asia/Bishkek',
    'Asia/Dushanbe', 'Asia/Ashgabat', 'Asia/Baku', 'Asia/Tbilisi',
    'Asia/Yerevan', 'Asia/Tehran', 'Asia/Dubai', 'Asia/Riyadh',
    'Asia/Qatar', 'Asia/Kuwait', 'Asia/Baghdad', 'Asia/Jerusalem',
    'Asia/Beirut', 'Asia/Amman', 'Asia/Karachi', 'Asia/Kolkata',
    'Asia/Colombo', 'Asia/Kathmandu', 'Asia/Dhaka', 'Asia/Yangon',
    'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Phnom_Penh', 'Asia/Vientiane',
    'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Jakarta', 'Asia/Makassar',
    'Asia/Manila', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei',
    'Asia/Shanghai', 'Asia/Seoul', 'Asia/Tokyo', 'Asia/Ulaanbaatar',
    'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Krasnoyarsk',
    'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan',
    'Asia/Kamchatka',
  ],
  'Америка': [
    'America/St_Johns', 'America/Halifax', 'America/New_York', 'America/Toronto',
    'America/Detroit', 'America/Chicago', 'America/Winnipeg', 'America/Mexico_City',
    'America/Denver', 'America/Edmonton', 'America/Phoenix', 'America/Los_Angeles',
    'America/Vancouver', 'America/Anchorage', 'Pacific/Honolulu',
    'America/Bogota', 'America/Lima', 'America/Caracas', 'America/Santiago',
    'America/Argentina/Buenos_Aires', 'America/Montevideo', 'America/Sao_Paulo',
    'America/Manaus', 'America/La_Paz', 'America/Asuncion', 'America/Guatemala',
    'America/Panama', 'America/Havana', 'America/Santo_Domingo', 'America/Puerto_Rico',
  ],
  'Африка': [
    'Africa/Casablanca', 'Africa/Algiers', 'Africa/Tunis', 'Africa/Tripoli',
    'Africa/Cairo', 'Africa/Khartoum', 'Africa/Addis_Ababa', 'Africa/Nairobi',
    'Africa/Dar_es_Salaam', 'Africa/Kampala', 'Africa/Lagos', 'Africa/Accra',
    'Africa/Abidjan', 'Africa/Dakar', 'Africa/Kinshasa', 'Africa/Luanda',
    'Africa/Johannesburg', 'Africa/Harare', 'Africa/Maputo', 'Africa/Windhoek',
  ],
  'Океания': [
    'Australia/Perth', 'Australia/Darwin', 'Australia/Adelaide',
    'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne',
    'Australia/Hobart', 'Pacific/Auckland', 'Pacific/Fiji',
    'Pacific/Port_Moresby', 'Pacific/Guam', 'Pacific/Noumea',
  ],
  'UTC': ['UTC', 'Etc/GMT+12', 'Etc/GMT+8', 'Etc/GMT+5', 'Etc/GMT', 'Etc/GMT-3', 'Etc/GMT-8'],
};

export const ALL_TIMEZONES = Object.values(TIMEZONES).flat();

/** Verified against the host's own ICU data, so a typo cannot reach a launch. */
export function isValidTimezone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
