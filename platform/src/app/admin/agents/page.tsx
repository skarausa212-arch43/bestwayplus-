import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listAgents } from '@/modules/admin/agents';
import { can } from '@/modules/rbac/authorize';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { VerificationControl } from '@/components/admin/VerificationControl';
import type { VerificationStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  NOT_SUBMITTED: 'neutral', PENDING: 'info', VERIFIED: 'positive',
  INFO_REQUIRED: 'warning', REJECTED: 'danger',
};

export default async function AdminAgents({
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

  const agents = await listAgents(session, {
    status: status as VerificationStatus | undefined,
    query: q,
  });

  // Only ADMIN and above may grant a credential; a manager sees the queue but
  // gets no controls — and the endpoint refuses them regardless.
  const mayDecide = can(session, 'verification:decide', { ownerUserId: session.userId });

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('agents')}</SectionTitle>

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

      {agents.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">{t('noResults')}</p></Card>
      ) : (
        <ul className="grid gap-3">
          {agents.map((agent) => (
            <Card as="li" key={agent.id}>
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <a href={`/admin/agents/${agent.userId}`} className="font-display text-base font-extrabold text-ink hover:text-emerald">
                    {[agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.user.email}
                  </a>
                  <p className="mt-1 text-xs text-ink-muted">
                    {[agent.agencyName, agent.country].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {/* A self-entered number is data, never a credential. */}
                    licence: <span className="tabular-nums">{agent.fifaLicenceNumber ?? '—'}</span>
                    {' · '}
                    {format.dateTime(agent.user.createdAt, { dateStyle: 'medium' })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <Pill tone={TONE[agent.verificationStatus] ?? 'neutral'}>
                    {ts(`ver${agent.verificationStatus}`)}
                  </Pill>
                  {mayDecide && (
                    <VerificationControl agentUserId={agent.userId} current={agent.verificationStatus} />
                  )}
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
