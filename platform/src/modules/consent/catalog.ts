import { textHash } from '@/lib/crypto';
import type { AppLocale } from '@/i18n/routing';

/**
 * The exact wording shown for each consent, per locale and per version.
 *
 * Consent records store a hash of this text, so it is always provable which
 * wording a person agreed to — even after the policy is rewritten. Bump the
 * version whenever any string here changes; never edit a released version in
 * place.
 */
export const CONSENT_POLICY_VERSION = '2025-01';

export type ConsentKind =
  | 'TERMS' | 'PRIVACY' | 'PROFILE_SHARING' | 'MARKETING'
  | 'COOKIES_ANALYTICS' | 'COOKIES_MARKETING';

/** Required consents block account creation. Optional ones never do. */
export const REQUIRED_CONSENTS: readonly ConsentKind[] = ['TERMS', 'PRIVACY'];
export const OPTIONAL_CONSENTS: readonly ConsentKind[] = ['PROFILE_SHARING', 'MARKETING'];

type Wording = Record<AppLocale, string>;

export const CONSENT_TEXT: Record<ConsentKind, Wording> = {
  TERMS: {
    en: 'I accept the terms and conditions of Bestway Plus Sp. z o.o.',
    pl: 'Akceptuję regulamin Bestway Plus Sp. z o.o.',
    ru: 'Я принимаю пользовательское соглашение Bestway Plus Sp. z o.o.',
  },
  PRIVACY: {
    en: 'I have read the privacy policy and understand how my personal data is processed.',
    pl: 'Zapoznałem się z polityką prywatności i rozumiem, w jaki sposób przetwarzane są moje dane osobowe.',
    ru: 'Я ознакомился с политикой конфиденциальности и понимаю, как обрабатываются мои персональные данные.',
  },
  PROFILE_SHARING: {
    en: 'I authorise Bestway Plus to share my professional profile with selected football clubs, licensed agents and professional partners for the purpose of evaluating potential cooperation opportunities.',
    pl: 'Upoważniam Bestway Plus do udostępniania mojego profilu zawodowego wybranym klubom piłkarskim, licencjonowanym agentom i partnerom zawodowym w celu oceny potencjalnych możliwości współpracy.',
    ru: 'Я разрешаю Bestway Plus передавать мой профессиональный профиль отдельным футбольным клубам, лицензированным агентам и профессиональным партнёрам для оценки возможного сотрудничества.',
  },
  MARKETING: {
    en: 'I would like to receive occasional updates about services and opportunities.',
    pl: 'Chcę otrzymywać okazjonalne informacje o usługach i możliwościach.',
    ru: 'Я хочу иногда получать новости об услугах и возможностях.',
  },
  COOKIES_ANALYTICS: {
    en: 'Allow analytics cookies that help us understand how the site is used.',
    pl: 'Zezwól na pliki cookie analityczne, które pomagają nam zrozumieć sposób korzystania z serwisu.',
    ru: 'Разрешить аналитические cookie, помогающие понять, как используется сайт.',
  },
  COOKIES_MARKETING: {
    en: 'Allow marketing cookies.',
    pl: 'Zezwól na marketingowe pliki cookie.',
    ru: 'Разрешить маркетинговые cookie.',
  },
};

export function consentTextHash(kind: ConsentKind, locale: AppLocale): string {
  return textHash(CONSENT_TEXT[kind][locale]);
}
