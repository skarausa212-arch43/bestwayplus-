import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/modules/auth/session';
import { getAgentForStaff } from '@/modules/admin/agents';
import { can } from '@/modules/rbac/authorize';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { VerificationControl } from '@/components/admin/VerificationControl';
import { RequestDocumentForm } from '@/components/admin/RequestDocumentForm';

export const dynamic = 'force-dynamic';

const TABS = ['profile', 'documents', 'activity', 'notes'] as const;
type Tab = (typeof TABS)[number];

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  NOT_SUBMITTED: 'neutral', PENDING: 'info', VERIFIED: 'positive',
  INFO_REQUIRED: 'warning', REJECTED: 'danger',
};

/**
 * Agents got a list page and a verification control but never a detail
 * page — the list card had nowhere to link to, so opening an agent's own
 * record was simply impossible. This mirrors the player detail page
 * (same generic documents/activity/notes tabs, same request-document
 * action) with an agent-shaped profile tab in place of the player one;
 * completion rings and share links stay player-only, they don't map to
 * anything on an AgentProfile.
 */
export default async function AdminAgentDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) return null;

  const { id } = await params;
  const { tab } = await searchParams;
  const active: Tab = (TABS as readonly string[]).includes(tab ?? '') ? (tab as Tab) : 'profile';

  const t = await getTranslations('admin');
  const f = await getTranslations('forms');
  const ts = await getTranslations('statuses');
  const td = await getTranslations('documents');
  const format = await getFormatter();

  const agent = await getAgentForStaff(session, id);
  if (!agent) notFound();

  const [documents, activity, notes] = await Promise.all([
    active === 'documents'
      ? prisma.document.findMany({
          where: { ownerUserId: id, deletedAt: null },
          select: { id: true, type: true, name: true, status: true, scanStatus: true, createdAt: true, expiryDate: true },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
    active === 'activity'
      ? prisma.activityLog.findMany({
          where: { subjectUserId: id },
          select: { id: true, action: true, createdAt: true, actor: { select: { email: true } } },
          orderBy: { createdAt: 'desc' },
          take: 60,
        })
      : Promise.resolve([]),
    active === 'notes'
      ? prisma.adminNote.findMany({
          where: { subjectUserId: id },
          select: { id: true, body: true, createdAt: true, author: { select: { email: true } } },
          orderBy: { createdAt: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const name = [agent.firstName, agent.lastName].filter(Boolean).join(' ') || agent.user.email;
  const mayDecide = can(session, 'verification:decide', { ownerUserId: id });

  const PROFILE_ROWS: Array<[string, string]> = [
    [f('agencyName'), agent.agencyName ?? '—'],
    [f('country'), agent.country ?? '—'],
    [f('nationality'), agent.nationality ?? '—'],
    [f('fifaLicence'), agent.fifaLicenceNumber ?? '—'],
    [f('website'), agent.website ?? '—'],
    [f('phone'), agent.phone ?? '—'],
    [f('markets'), agent.markets.join(', ') || '—'],
    [f('countries'), agent.countries.join(', ') || '—'],
    [f('leagues'), agent.leagues.join(', ') || '—'],
    [f('languages'), agent.languages.join(', ') || '—'],
    [f('specialisations'), agent.specialisations.join(', ') || '—'],
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <SectionTitle>{name}</SectionTitle>
          <p className="mt-1.5 text-sm text-ink-muted">
            {[agent.agencyName, agent.country].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-1 text-xs text-ink-faint">
            {agent.user.email} · {agent.user.responsibleManager?.email ?? '—'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Pill tone={TONE[agent.verificationStatus] ?? 'neutral'}>{ts(`ver${agent.verificationStatus}`)}</Pill>
          {mayDecide && <VerificationControl agentUserId={id} current={agent.verificationStatus} />}
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line-faint pb-2">
        {TABS.map((name) => (
          <a
            key={name}
            href={`/admin/agents/${id}?tab=${name}`}
            aria-current={name === active ? 'page' : undefined}
            className={
              'rounded-[8px] px-3.5 py-2 font-display text-[10px] font-bold uppercase tracking-[0.16em] transition-colors ' +
              (name === active ? 'bg-emerald/12 text-emerald' : 'text-ink-muted hover:bg-bg-panel hover:text-ink')
            }
          >
            {t(`tab${name.charAt(0).toUpperCase()}${name.slice(1)}`)}
          </a>
        ))}
      </nav>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid gap-4">
          {active === 'profile' && (
            <Card>
              <dl className="grid gap-4 sm:grid-cols-3">
                {PROFILE_ROWS.map(([label, value]) => (
                  <div key={label}>
                    <dt className="font-display text-[9.5px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{label}</dt>
                    <dd className="mt-1.5 text-sm text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
              {agent.bio && (
                <p className="mt-6 whitespace-pre-line border-t border-line-faint pt-5 text-sm leading-relaxed text-ink-muted">
                  {agent.bio}
                </p>
              )}
              {agent.verificationNote && (
                <div className="mt-6 border-t border-line-faint pt-5">
                  <Eyebrow>{t('internalOnly')}</Eyebrow>
                  <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{agent.verificationNote}</p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {agent.verifiedBy?.email ?? '—'}
                    {agent.verifiedAt && ` · ${format.dateTime(agent.verifiedAt, { dateStyle: 'medium' })}`}
                  </p>
                </div>
              )}
            </Card>
          )}

          {active === 'documents' && (
            <Card>
              <ul className="grid gap-2">
                {documents.map((document) => (
                  <li key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line-faint px-4 py-3 text-sm">
                    <span className="text-ink">{td(`type${document.type}`)}</span>
                    <span className="text-ink-faint">{format.dateTime(document.createdAt, { dateStyle: 'medium' })}</span>
                    <span className="text-ink-muted">{document.status}</span>
                  </li>
                ))}
                {documents.length === 0 && <li className="text-sm text-ink-muted">{t('noResults')}</li>}
              </ul>
            </Card>
          )}

          {active === 'activity' && (
            <Card>
              <ul className="grid gap-1.5 text-sm">
                {activity.map((row) => (
                  <li key={row.id} className="flex flex-wrap justify-between gap-3 border-b border-line-faint pb-2">
                    <span className="text-ink-muted">{row.action}</span>
                    <span className="text-xs text-ink-faint">
                      {row.actor?.email ?? '—'} · {format.dateTime(row.createdAt, { dateStyle: 'short', timeStyle: 'short' })}
                    </span>
                  </li>
                ))}
                {activity.length === 0 && <li className="text-ink-muted">{t('noResults')}</li>}
              </ul>
            </Card>
          )}

          {active === 'notes' && (
            <Card className="border-l-2 border-l-state-warn">
              <Eyebrow>{t('internalOnly')}</Eyebrow>
              <ul className="mt-4 grid gap-3 text-sm">
                {notes.map((note) => (
                  <li key={note.id} className="rounded-[10px] border border-line-faint p-4">
                    <p className="whitespace-pre-line text-ink">{note.body}</p>
                    <p className="mt-2 text-xs text-ink-faint">
                      {note.author.email} · {format.dateTime(note.createdAt, { dateStyle: 'medium' })}
                    </p>
                  </li>
                ))}
                {notes.length === 0 && <li className="text-ink-muted">{t('noResults')}</li>}
              </ul>
            </Card>
          )}
        </div>

        <aside className="grid gap-4">
          <Card>
            <Eyebrow>{t('requestDocument')}</Eyebrow>
            <div className="mt-4"><RequestDocumentForm targetUserId={id} /></div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
