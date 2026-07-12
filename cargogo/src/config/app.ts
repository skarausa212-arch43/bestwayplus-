// Единая точка конфигурации — название меняется здесь
export const APP_CONFIG = {
  name: 'PakujGo',
  tagline: 'Szybki transport na terenie całej Polski',
  defaultLocale: 'pl' as const,
  supportedLocales: ['pl', 'ru', 'en', 'uk', 'be', 'de'] as const,
  currency: 'zł',
  city: 'Wrocław',
  freeWaitingMinutes: 10,
  waitingPricePerMin: 2,
  offerTimeoutSec: 20,
  confirmationCodeMock: '4217',
};
export type Locale = (typeof APP_CONFIG.supportedLocales)[number];
