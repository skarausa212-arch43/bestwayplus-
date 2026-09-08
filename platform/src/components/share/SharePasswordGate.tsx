'use client';

import { useTranslations } from 'next-intl';

/**
 * The password travels as a query parameter so the whole view stays a server
 * render — there is no client-side state holding a secret, and the page is
 * already noindex, no-store via middleware.
 */
export function SharePasswordGate({ attempted }: { attempted: boolean }) {
  const t = useTranslations('share');

  return (
    <form method="get" className="grid max-w-sm gap-3 rounded-xl border border-line-faint bg-bg-raised p-6">
      <p className="text-sm text-ink">{t('passwordRequired')}</p>
      {attempted && <p className="text-xs text-state-bad">{t('wrongPassword')}</p>}
      <label className="grid gap-1.5">
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
          {t('passwordLabel')}
        </span>
        <input
          name="p" type="password" required autoComplete="off"
          className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald"
        />
      </label>
      <button type="submit"
              className="justify-self-start rounded-[10px] bg-emerald-gradient px-5 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C]">
        {t('open')}
      </button>
    </form>
  );
}
