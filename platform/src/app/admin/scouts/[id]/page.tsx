import { notFound } from 'next/navigation';
import { getFormatter, getTranslations } from 'next-intl/server';
import { prisma } from '@/lib/db';
import { getSessionUser } from '@/modules/auth/session';
import { getScoutForStaff } from '@/modules/admin/scouts';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { RequestDocumentForm } from '@/components/admin/RequestDocumentForm';

export const dynamic = 'force-dynamic';

const TABS = ['profile', 'documents', 'activity', 'notes'] as const;
type Tab = (typeof TABS)[number];

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  NOT_SUBMITTED: 'neutral', PENDING: 'info', VERIFIED: 'positive',
  INFO_REQUIRED: 'warning', REJECTED: 'danger',
};

export default async function AdminScoutDetail({
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

  const scout = await getScoutForStaff(session, id);
  if (!scout) notFound();

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

  const name = [scout.firstName, scout.lastName].filter(Boolean).join(' ') || scout.user.email;

  const PROFILE_ROWS: Array<[string, string]> = [
    [f('country'), scout.country ?? '—'],
    [f('experienceYears'), scout.experienceYears != null ? String(scout.experienceYears) : '—'],
    [f('markets'), scout.markets.join(', ') || '—'],
    [f('leagues'), scout.leagues.join(', ') || '—'],
    [f('languages'), scout.languages.join(', ') || '—'],
  ];

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <SectionTitle>{name}</SectionTitle>
          <p className="mt-1.5 text-sm text-ink-muted">{scout.country ?? '—'}</p>
          <p className="mt-1 text-xs text-ink-faint">
            {scout.user.email} · {scout.user.responsibleManager?.email ?? '—'}
          </p>
        </div>
        <Pill tone={TONE[scout.verificationStatus] ?? 'neutral'}>{ts(`ver${scout.verificationStatus}`)}</Pill>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-line-faint pb-2">
        {TABS.map((name) => (
          <a
            key={name}
            href={`/admin/scouts/${id}?tab=${name}`}
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
              {scout.bio && (
                <p className="mt-6 whitespace-pre-line border-t border-line-faint pt-5 text-sm leading-relaxed text-ink-muted">
                  {scout.bio}
                </p>
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
