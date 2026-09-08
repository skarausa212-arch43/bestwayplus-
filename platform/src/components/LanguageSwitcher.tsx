'use client';

import { useTransition } from 'react';
import { useLocale } from 'next-intl';
import { usePathname, useRouter } from '@/i18n/routing';
import { locales, type AppLocale } from '@/i18n/routing';

const LABEL: Record<AppLocale, string> = { en: 'EN', pl: 'PL', ru: 'RU' };

/**
 * Switching writes the cookie for everyone via next-intl, and for a signed-in
 * user also persists users.locale — which is what email templates read, so a
 * Polish user does not get English mail.
 */
export function LanguageSwitcher({ signedIn = false }: { signedIn?: boolean }) {
  const active = useLocale() as AppLocale;
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(next: AppLocale) {
    if (next === active) return;
    startTransition(() => {
      router.replace(pathname, { locale: next });
      if (signedIn) {
        void fetch('/api/v1/me/locale', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ locale: next }),
        });
      }
    });
  }

  return (
    <div role="group" aria-label="Language" className="flex items-center gap-1 text-[11px]">
      {locales.map((locale, index) => (
        <span key={locale} className="flex items-center gap-1">
          {index > 0 && <span aria-hidden className="text-ink-faint">|</span>}
          <button
            type="button"
            onClick={() => choose(locale)}
            aria-current={locale === active ? 'true' : undefined}
            disabled={pending}
            className={
              'px-1.5 py-1 font-display font-semibold tracking-[0.18em] transition-colors ' +
              (locale === active ? 'text-emerald' : 'text-ink-muted hover:text-ink')
            }
          >
            {LABEL[locale]}
          </button>
        </span>
      ))}
    </div>
  );
}
