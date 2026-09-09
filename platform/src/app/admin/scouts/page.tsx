import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listScouts } from '@/modules/admin/scouts';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import type { VerificationStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  NOT_SUBMITTED: 'neutral', PENDING: 'info', VERIFIED: 'positive',
  INFO_REQUIRED: 'warning', REJECTED: 'danger',
};

export default async function AdminScouts({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) return null;

  const { status, q } = await searchParams;
  const t = await getTranslations('admin');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();

  const scouts = await listScouts(session, {
    status: status as VerificationStatus | undefined,
    query: q,
  });

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('scouts')}</SectionTitle>

      <Card>
        <Eyebrow>{t('filters')}</Eyebrow>
        <form method="get" className="mt-4 flex flex-wrap gap-3">
          <input name="q" defaultValue={q ?? ''} placeholder={t('searchPlaceholder')}
                 className="min-w-[220px] flex-1 rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
          <select name="status" defaultValue={status ?? ''}
                  className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald">
            <option value="">—</option>
            {['NOT_SUBMITTED', 'PENDING', 'VERIFIED', 'INFO_REQUIRED', 'REJECTED'].map((value) => (
              <option key={value} value={value}>{ts(`ver${value}`)}</option>
            ))}
          </select>
          <button type="submit"
                  className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C]">
            {t('filters')}
          </button>
        </form>
      </Card>

      {scouts.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">{t('noResults')}</p></Card>
      ) : (
        <ul className="grid gap-3">
          {scouts.map((scout) => (
            <Card as="li" key={scout.id}>
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <a href={`/admin/scouts/${scout.userId}`} className="font-display text-base font-extrabold text-ink hover:text-emerald">
                    {[scout.firstName, scout.lastName].filter(Boolean).join(' ') || scout.user.email}
                  </a>
                  <p className="mt-1 text-xs text-ink-muted">{scout.country ?? '—'}</p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {format.dateTime(scout.user.createdAt, { dateStyle: 'medium' })}
                  </p>
                </div>
                <Pill tone={TONE[scout.verificationStatus] ?? 'neutral'}>{ts(`ver${scout.verificationStatus}`)}</Pill>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
