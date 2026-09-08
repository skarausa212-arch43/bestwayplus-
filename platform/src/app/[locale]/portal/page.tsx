import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/routing';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { getCompletion } from '@/modules/players/service';
import { countByStatus, listOwnRequests, listExpiringSoon } from '@/modules/documents/queries';
import { listForParticipant } from '@/modules/opportunities/service';
import { Card, Eyebrow, SectionTitle, EmptyState } from '@/components/ui';
import { CompletionRing } from '@/components/portal/CompletionRing';
import { StagePill } from '@/components/portal/StatusPill';

export const dynamic = 'force-dynamic';

export default async function PortalOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null; // layout already redirected

  const t = await getTranslations('portal');
  const isPlayer = session.role === 'PLAYER';

  const [completion, docCounts, requests, expiring, opportunities] = await Promise.all([
    isPlayer ? getCompletion(session) : Promise.resolve(null),
    countByStatus(session),
    listOwnRequests(session),
    listExpiringSoon(session),
    isPlayer || session.role === 'AGENT' ? listForParticipant(session) : Promise.resolve([]),
  ]);

  const needsAction = docCounts.ACTION_REQUIRED ?? 0;
  const actionable = requests.length + needsAction + expiring.length;
  const firstName = session.email.split('@')[0];

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('welcome', { name: firstName })}</SectionTitle>

      <div className="grid gap-4 md:grid-cols-3">
        {completion && (
          <Card className="flex items-center gap-5">
            <CompletionRing percent={completion.percent} />
            <div className="min-w-0">
              <Eyebrow>{t('completion')}</Eyebrow>
              {completion.next ? (
                <>
                  <p className="mt-2 text-sm text-ink-muted">{t('nextStep')}</p>
                  <Link href={completion.next.href} className="mt-1 block font-display font-bold text-ink hover:text-emerald">
                    {t(completion.next.labelKey)}
                  </Link>
                </>
              ) : (
                <p className="mt-2 text-sm text-emerald">{t('profileComplete')}</p>
              )}
            </div>
          </Card>
        )}

        <Card>
          <Eyebrow>{t('documents')}</Eyebrow>
          <p className="mt-3 font-display text-2xl font-extrabold">
            {t('documentsSummary', {
              approved: docCounts.APPROVED ?? 0,
              pending: docCounts.UNDER_REVIEW ?? 0,
            })}
          </p>
          {needsAction > 0 && (
            <p className="mt-2 text-sm text-state-warn">{t('documentsNeedAction', { count: needsAction })}</p>
          )}
          <Link href="/portal/documents" className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-emerald hover:underline">
            {t('viewAll')}
          </Link>
        </Card>

        <Card>
          <Eyebrow>{t('activeOpportunities')}</Eyebrow>
          <p className="mt-3 font-display text-4xl font-extrabold">{opportunities.length}</p>
          {opportunities.length > 0 && (
            <Link href="/portal/opportunities" className="mt-4 inline-block text-xs font-semibold uppercase tracking-[0.18em] text-emerald hover:underline">
              {t('viewAll')}
            </Link>
          )}
        </Card>
      </div>

      {/* The action block is absent, not empty, when nothing is pending. */}
      {actionable > 0 ? (
        <Card className="border-l-2 border-l-state-warn">
          <Eyebrow>{t('actionRequired')}</Eyebrow>
          <ul className="mt-3 grid gap-2 text-sm">
            {requests.map((request) => (
              <li key={request.id}>
                <Link href="/portal/requests" className="text-ink hover:text-emerald">
                  {request.message ?? request.type}
                </Link>
              </li>
            ))}
            {needsAction > 0 && (
              <li>
                <Link href="/portal/documents?status=ACTION_REQUIRED" className="text-ink hover:text-emerald">
                  {t('documentsNeedAction', { count: needsAction })}
                </Link>
              </li>
            )}
            {expiring.map((document) => (
              <li key={document.id} className="text-ink-muted">
                {t('expiringSoon')} — {document.name}
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card><p className="text-sm text-ink-muted">{t('nothingPending')}</p></Card>
      )}

      {completion && completion.checklist.some((item) => !item.done) && (
        <Card>
          <Eyebrow>{t('checklistTitle')}</Eyebrow>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {completion.checklist.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition-colors hover:bg-bg-panel ${
                    item.done ? 'text-ink-faint' : 'text-ink'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`grid h-4 w-4 flex-none place-items-center rounded-full border text-[9px] ${
                      item.done ? 'border-emerald bg-emerald text-[#04150C]' : 'border-line'
                    }`}
                  >
                    {item.done ? '✓' : ''}
                  </span>
                  {t(item.labelKey)}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {opportunities.length > 0 && (
        <Card>
          <Eyebrow>{t('activeOpportunities')}</Eyebrow>
          <ul className="mt-4 grid gap-2">
            {opportunities.slice(0, 4).map((entry) => (
              <li key={entry.id}>
                <Link
                  href={`/portal/opportunities/${entry.opportunity.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-line-faint px-4 py-3 hover:bg-bg-panel"
                >
                  <span className="font-display text-sm font-bold">{entry.opportunity.name}</span>
                  <StagePill stage={entry.stage} />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {opportunities.length === 0 && !completion && <EmptyState>{t('nothingPending')}</EmptyState>}
    </div>
  );
}
