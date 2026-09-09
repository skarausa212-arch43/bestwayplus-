import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listForStaff } from '@/modules/opportunities/service';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { CreateOpportunityForm } from '@/components/admin/CreateOpportunityForm';
import type { OpportunityStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  DRAFT: 'neutral', OPEN: 'positive', ON_HOLD: 'warning', CLOSED: 'danger',
};

export default async function AdminOpportunities({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) return null;

  const { status, q } = await searchParams;
  const admin = await getTranslations('admin');
  const t = await getTranslations('opportunities');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();

  const opportunities = await listForStaff(session, {
    status: status as OpportunityStatus | undefined,
    query: q,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <SectionTitle>{admin('opportunities')}</SectionTitle>

        <Card>
          <Eyebrow>{admin('filters')}</Eyebrow>
          <form method="get" className="mt-4 flex flex-wrap gap-3">
            <input name="q" defaultValue={q ?? ''} placeholder={admin('searchPlaceholder')}
                   className="min-w-[220px] flex-1 rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
            <select name="status" defaultValue={status ?? ''}
                    className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald">
              <option value="">—</option>
              {['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED'].map((value) => (
                <option key={value} value={value}>{ts(`opp${value}` as never)}</option>
              ))}
            </select>
            <button type="submit"
                    className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C]">
              {admin('filters')}
            </button>
          </form>
        </Card>

        {opportunities.length === 0 ? (
          <Card><p className="text-sm text-ink-muted">{admin('noResults')}</p></Card>
        ) : (
          <ul className="grid gap-3">
            {opportunities.map((opportunity) => (
              <Card as="li" key={opportunity.id}>
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <a href={`/admin/opportunities/${opportunity.id}`} className="font-display text-base font-extrabold text-ink hover:text-emerald">
                      {opportunity.name}
                    </a>
                    <p className="mt-1 text-xs text-ink-muted">
                      {[opportunity.clubName, opportunity.position, opportunity.country].filter(Boolean).join(' · ')}
                    </p>
                    <p className="mt-2 text-xs text-ink-faint">
                      {t('participants')}: {opportunity._count.participants}
                    </p>
                  </div>
                  <Pill tone={TONE[opportunity.status] ?? 'neutral'}>{ts(`opp${opportunity.status}` as never)}</Pill>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <Eyebrow>{t('createOpportunity')}</Eyebrow>
        <div className="mt-4"><CreateOpportunityForm /></div>
      </Card>
    </div>
  );
}
