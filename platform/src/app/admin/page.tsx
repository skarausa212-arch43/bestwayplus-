import { getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { dashboardCounters } from '@/modules/admin/dashboard';
import { reviewQueue } from '@/modules/admin/documents';
import { Card, Eyebrow, SectionTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('admin');
  const [counters, queue] = await Promise.all([
    dashboardCounters(session),
    reviewQueue(session, { take: 8 }),
  ]);

  // Every counter is a filtered link, not a decorative tile.
  const TILES: Array<{ key: keyof typeof counters; href: string; hint?: string }> = [
    { key: 'documentsToReview', href: '/admin/documents?status=UNDER_REVIEW' },
    { key: 'pendingVerification', href: '/admin/agents?status=PENDING' },
    { key: 'newPlayers', href: '/admin/players?sort=new', hint: t('lastSevenDays') },
    { key: 'newAgents', href: '/admin/agents?sort=new', hint: t('lastSevenDays') },
    { key: 'newClubs', href: '/admin/clubs?sort=new', hint: t('lastSevenDays') },
    { key: 'newInvestors', href: '/admin/investors?sort=new', hint: t('lastSevenDays') },
    { key: 'newScouts', href: '/admin/scouts?sort=new', hint: t('lastSevenDays') },
    { key: 'activeOpportunities', href: '/admin/opportunities?status=OPEN' },
    { key: 'openTasks', href: '/admin/tasks?assignee=me' },
    { key: 'unreadMessages', href: '/admin/messages', hint: t('lastSevenDays') },
  ];

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('dashboard')}</SectionTitle>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {TILES.map((tile) => (
          <a key={tile.key} href={tile.href} className="block">
            <Card className="transition-colors hover:border-emerald/40 hover:bg-bg-panel">
              <Eyebrow>{t(tile.key)}</Eyebrow>
              <p className="mt-3 font-display text-4xl font-extrabold tabular-nums">{counters[tile.key]}</p>
              {tile.hint && <p className="mt-1 text-[11px] text-ink-faint">{tile.hint}</p>}
            </Card>
          </a>
        ))}
      </div>

      <Card>
        <div className="flex items-center justify-between gap-4">
          <Eyebrow>{t('documentsToReview')}</Eyebrow>
          <a href="/admin/documents" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald hover:underline">
            {t('queues')}
          </a>
        </div>
        {queue.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">{t('noResults')}</p>
        ) : (
          <ul className="mt-4 grid gap-1.5">
            {queue.map((document) => (
              <li key={document.id}>
                <a
                  href={`/admin/documents?focus=${document.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line-faint px-4 py-3 text-sm hover:bg-bg-panel"
                >
                  <span className="text-ink">{document.owner.email}</span>
                  <span className="text-ink-muted">{document.type}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
