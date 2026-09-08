import { headers } from 'next/headers';
import { getTranslations } from 'next-intl/server';
import { openShareLink } from '@/modules/share/service';
import { SECTION_FIELDS, SHARE_SECTIONS } from '@/modules/share/sections';
import { SharePasswordGate } from '@/components/share/SharePasswordGate';
import { ShareDocuments } from '@/components/share/ShareDocuments';
import { negotiateLocale } from '@/i18n/negotiate';

export const dynamic = 'force-dynamic';

export default async function SharePage({
  params, searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ p?: string }>;
}) {
  const { token } = await params;
  const { p } = await searchParams;
  const locale = await negotiateLocale();
  const t = await getTranslations({ locale, namespace: 'share' });

  const requestHeaders = await headers();
  const result = await openShareLink(token, p ?? null, {
    ip: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    userAgent: requestHeaders.get('user-agent'),
  });

  // Unknown, expired and revoked all look identical from out here, on purpose.
  if (result.outcome === 'not-found') {
    return <p className="text-sm text-ink-muted">{t('unavailable')}</p>;
  }
  if (result.outcome === 'locked') {
    return <p className="text-sm text-state-warn">{t('tooManyAttempts')}</p>;
  }
  if (result.outcome === 'password-required') {
    return <SharePasswordGate attempted={Boolean(p)} />;
  }

  const { view } = result;
  const value = (key: string): string | null => {
    const raw = view.profile[key];
    if (raw === null || raw === undefined || raw === '') return null;
    if (raw instanceof Date) return raw.toISOString().slice(0, 10);
    if (Array.isArray(raw)) return raw.length ? raw.join(', ') : null;
    return String(raw);
  };

  const name = [value('firstName'), value('lastName')].filter(Boolean).join(' ');

  return (
    <>
      <div>
        <p className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
          {t('sharedBy')}
        </p>
        <h1 className="mt-3 font-display text-[clamp(1.9rem,4vw,3rem)] font-extrabold tracking-tight">
          {name || t('title')}
        </h1>
        <p className="mt-2 text-xs text-ink-faint">
          {t('expires', { date: view.expiresAt.toISOString().slice(0, 10) })} · {t('recorded')}
        </p>
      </div>

      {SHARE_SECTIONS.filter((section) => view.sections[section]).map((section) => {
        const rows = SECTION_FIELDS[section]
          .map((field) => [field, value(field)] as const)
          .filter((row): row is [string, string] => row[1] !== null);
        if (rows.length === 0) return null;

        return (
          <section key={section} className="rounded-xl border border-line-faint bg-bg-raised p-6">
            <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
              {t(`section${section.charAt(0).toUpperCase()}${section.slice(1)}` as 'sectionIdentity')}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              {rows.map(([field, v]) => (
                <div key={field}>
                  <dt className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
                    {field}
                  </dt>
                  <dd className="mt-1 text-sm text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        );
      })}

      <section className="rounded-xl border border-line-faint bg-bg-raised p-6">
        <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
          {t('documents')}
        </h2>
        <div className="mt-4">
          {view.documents.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('noDocuments')}</p>
          ) : (
            <ShareDocuments token={token} password={p ?? null} documents={view.documents} />
          )}
        </div>
      </section>
    </>
  );
}
