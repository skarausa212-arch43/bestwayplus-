import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { LogoMark, Wordmark } from '@/components/Logo';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

/**
 * The full marketing site — players, clubs, agents, investors, services,
 * about, contact — already exists at bestwayfootball.pl, nineteen finished
 * pages deep. This app is the account side of the same brand, not a second
 * copy of that content, so these go there rather than to local routes that
 * would just be thin duplicates (or, until they're built, 404s).
 */
const MARKETING_HOST = 'https://bestwayfootball.pl';

function marketingUrl(locale: AppLocale, slug: string) {
  const base = locale === 'en' ? MARKETING_HOST : `${MARKETING_HOST}/${locale}`;
  return slug === '' ? `${base}/` : `${base}/${slug}.html`;
}

const AUDIENCES = [
  { key: 'audiencePlayers', slug: 'players', nav: 'players' },
  { key: 'audienceClubs', slug: 'clubs', nav: 'clubs' },
  { key: 'audienceAgents', slug: 'agents', nav: 'agents' },
  { key: 'audienceInvestors', slug: 'investors', nav: 'investors' },
] as const;

const MARKETING_NAV = ['services', 'about', 'contact'] as const;

const STEPS = ['howStep1', 'howStep2', 'howStep3'] as const;

export default async function HomePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const t = await getTranslations('home');
  const nav = await getTranslations('nav');
  const legal = await getTranslations('legal');

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-line-faint bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-[78px] w-[min(1300px,100%-2.5rem)] items-center gap-8">
          <Link href="/" className="flex flex-none items-center gap-3">
            <LogoMark className="h-9 w-auto" />
            <Wordmark />
          </Link>
          <nav className="ms-auto hidden items-center gap-7 lg:flex">
            {AUDIENCES.map(({ slug, nav: navKey }) => (
              <a
                key={slug}
                href={marketingUrl(locale as AppLocale, slug)}
                className="font-display text-[11.5px] font-semibold uppercase tracking-[0.2em] text-ink-muted transition-colors hover:text-ink"
              >
                {nav(navKey)}
              </a>
            ))}
            {MARKETING_NAV.map((key) => (
              <a
                key={key}
                href={marketingUrl(locale as AppLocale, key)}
                className="font-display text-[11.5px] font-semibold uppercase tracking-[0.2em] text-ink-muted transition-colors hover:text-ink"
              >
                {nav(key)}
              </a>
            ))}
          </nav>
          <div className="ms-auto flex items-center gap-4 lg:ms-0">
            <LanguageSwitcher />
            <Link
              href="/sign-in"
              className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted hover:text-ink"
            >
              {nav('signIn')}
            </Link>
            <Link
              href="/join"
              className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-[#04150C]"
            >
              {nav('join')}
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden py-20 text-center sm:py-28">
          <div
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-[-32%] h-[760px] w-[min(1100px,120vw)] -translate-x-1/2"
            style={{ background: 'radial-gradient(50% 50% at 50% 50%, rgba(51,193,119,.22), transparent 68%)' }}
          />
          <div className="relative mx-auto w-[min(1300px,100%-2.5rem)]">
            <div className="mx-auto grid justify-items-center gap-5">
              <LogoMark className="h-24 w-auto sm:h-28" id="hero" />
              <Wordmark stacked />
            </div>
            <p className="mt-8 font-display text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald">
              {t('eyebrow')}
            </p>
            <h1 className="mx-auto mt-5 max-w-[17ch] font-display text-[clamp(2.25rem,5.2vw,4.75rem)] font-extrabold leading-[1.02] tracking-tight">
              {t('heroTitle')}
            </h1>
            <p className="mx-auto mt-6 max-w-[60ch] text-ink-muted">{t('heroBody')}</p>
            <div className="mt-9 flex flex-wrap justify-center gap-3.5">
              <Link
                href="/join"
                className="rounded-[10px] bg-emerald-gradient px-6 py-3.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#04150C] shadow-glow"
              >
                {t('ctaPrimary')}
              </Link>
              <Link
                href="/services"
                className="rounded-[10px] border border-line px-6 py-3.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink hover:border-emerald"
              >
                {t('ctaSecondary')}
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-line-faint py-16">
          <div className="mx-auto w-[min(1300px,100%-2.5rem)]">
            <h2 className="font-display text-[clamp(1.6rem,3.2vw,2.9rem)] font-extrabold tracking-tight">
              {t('audiencesTitle')}
            </h2>
            <div className="mt-8 grid gap-px overflow-hidden rounded-xl border border-line-faint bg-line-faint sm:grid-cols-2 lg:grid-cols-4">
              {AUDIENCES.map(({ key, slug, nav: navKey }) => (
                <a key={key} href={marketingUrl(locale as AppLocale, slug)}
                   className="grid gap-2 bg-bg p-6 transition-colors hover:bg-bg-panel">
                  <span className="font-display text-lg font-extrabold text-ink">{nav(navKey)}</span>
                  <span className="text-sm leading-relaxed text-ink-muted">{t(key)}</span>
                </a>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-line-faint py-16">
          <div className="mx-auto w-[min(1300px,100%-2.5rem)]">
            <h2 className="font-display text-[clamp(1.6rem,3.2vw,2.9rem)] font-extrabold tracking-tight">
              {t('howTitle')}
            </h2>
            <ol className="mt-8 grid gap-4 lg:grid-cols-3">
              {STEPS.map((key, index) => (
                <li key={key} className="rounded-xl border border-line-faint bg-bg-raised p-6">
                  <span className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-3 text-ink-muted">{t(key)}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="border-t border-line-faint py-16">
          <div className="mx-auto w-[min(1300px,100%-2.5rem)] rounded-xl border border-line-faint border-l-2 border-l-emerald-strong bg-bg-raised p-6">
            <span className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
              {legal('notices')}
            </span>
            <p className="mt-3 max-w-[80ch] text-sm leading-relaxed text-ink-muted">
              {legal('agentNotice')} {legal('professionalNotice')}
            </p>
          </div>
        </section>
      </main>
    </>
  );
}
