import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';

/**
 * The role chooser. The choice is a route segment rather than stored state,
 * so each form is linkable and the back button behaves.
 */
const ROLES = [
  { slug: 'player', label: 'rolePlayer', hint: 'rolePlayerHint' },
  { slug: 'agent', label: 'roleAgent', hint: 'roleAgentHint' },
  { slug: 'scout', label: 'roleScout', hint: 'roleScoutHint' },
  { slug: 'club', label: 'roleClub', hint: 'roleClubHint' },
  { slug: 'investor', label: 'roleInvestor', hint: 'roleInvestorHint' },
] as const;

export default async function JoinPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const t = await getTranslations('join');
  const nav = await getTranslations('nav');

  return (
    <main className="mx-auto w-[min(1000px,100%-2.5rem)] py-20">
      <h1 className="font-display text-[clamp(2rem,4.4vw,3.5rem)] font-extrabold tracking-tight">
        {t('title')}
      </h1>
      <p className="mt-4 max-w-[60ch] text-ink-muted">{t('hint')}</p>

      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map(({ slug, label, hint }) => (
          <li key={slug}>
            <Link
              href={`/join/${slug}`}
              className="grid h-full gap-2 rounded-xl border border-line-faint bg-bg-raised p-6 transition-colors hover:border-emerald hover:bg-bg-panel"
            >
              <span className="font-display text-lg font-extrabold text-ink">{t(label)}</span>
              <span className="text-sm text-ink-muted">{t(hint)}</span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-10 max-w-[70ch] rounded-xl border border-line-faint border-l-2 border-l-emerald-strong bg-bg-raised p-5 text-sm text-ink-muted">
        {t('reassurance')}
      </p>

      <p className="mt-8 text-sm text-ink-muted">
        {t('haveAccount')}{' '}
        <Link href="/sign-in" className="text-emerald hover:underline">
          {nav('signIn')}
        </Link>
      </p>
    </main>
  );
}
