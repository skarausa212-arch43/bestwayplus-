import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listActivity, listActionTypes } from '@/modules/admin/audit';
import { Card, Eyebrow, SectionTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';

export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; email?: string; cursor?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) return null;

  const params = await searchParams;
  const t = await getTranslations('admin');
  const format = await getFormatter();

  // audit:read is SUPER_ADMIN-only. The layout lets any staff member into
  // /admin, so this page enforces its own boundary rather than relying on
  // the nav being hidden from everyone else.
  if (session.role !== 'SUPER_ADMIN') {
    return <Card><p className="text-sm text-ink-muted">{t('noAccess')}</p></Card>;
  }

  const [{ rows, nextCursor }, actionTypes] = await Promise.all([
    listActivity(session, { action: params.action, email: params.email, cursor: params.cursor }),
    listActionTypes(session),
  ]);

  const COLUMNS = ['colWhen', 'colAction', 'colActor', 'colSubject'] as const;

  const queryFor = (cursor: string) => {
    const query = new URLSearchParams();
    if (params.action) query.set('action', params.action);
    if (params.email) query.set('email', params.email);
    query.set('cursor', cursor);
    return `/admin/audit?${query.toString()}`;
  };

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('audit')}</SectionTitle>

      <Card>
        <Eyebrow>{t('filters')}</Eyebrow>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-3">
          <select name="action" defaultValue={params.action ?? ''}
                  className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald">
            <option value="">{t('auditAllActions')}</option>
            {actionTypes.map((action) => <option key={action} value={action}>{action}</option>)}
          </select>
          <input name="email" defaultValue={params.email ?? ''} placeholder={t('auditEmailPlaceholder')}
                 className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
          <button type="submit"
                  className="justify-self-start rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C]">
            {t('filters')}
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">{t('noResults')}</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-faint">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="bg-bg-panel/70">
                {COLUMNS.map((column) => (
                  <th key={column}
                      className="whitespace-nowrap px-4 py-3 text-left font-display text-[9.5px] font-bold uppercase tracking-[0.18em] text-emerald">
                    {t(column)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-line-faint hover:bg-bg-panel/60">
                  <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-muted">
                    {format.dateTime(row.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-ink">{row.action}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.actor?.email ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.subject?.email ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <a href={queryFor(nextCursor)}
           className="justify-self-start rounded-[10px] border border-line px-5 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted hover:border-emerald hover:text-ink">
          →
        </a>
      )}
    </div>
  );
}
