import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listPlayers } from '@/modules/admin/players';
import { Card, Eyebrow, SectionTitle } from '@/components/ui';

export const dynamic = 'force-dynamic';

function age(dateOfBirth: Date | null): string {
  if (!dateOfBirth) return '—';
  const now = new Date();
  let years = now.getUTCFullYear() - dateOfBirth.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dateOfBirth.getUTCMonth() ||
    (now.getUTCMonth() === dateOfBirth.getUTCMonth() && now.getUTCDate() < dateOfBirth.getUTCDate());
  if (beforeBirthday) years -= 1;
  return String(years);
}

export default async function AdminPlayers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getSessionUser();
  if (!session) return null;

  const params = await searchParams;
  const t = await getTranslations('admin');
  const format = await getFormatter();

  // Filters live in the URL, so a view can be pasted to a colleague.
  const { rows, nextCursor } = await listPlayers(session, {
    query: params.q,
    position: params.position,
    nationality: params.nationality,
    league: params.league,
    hasAgent: params.hasAgent === undefined ? undefined : params.hasAgent === 'true',
    minCompletion: params.minCompletion ? Number(params.minCompletion) : undefined,
    contractExpiringBefore: params.contractBefore ? new Date(params.contractBefore) : undefined,
    cursor: params.cursor,
  });

  const COLUMNS = ['colName', 'colAge', 'colNationality', 'colPosition', 'colClub',
                   'colContract', 'colCompletion', 'colDocuments', 'colManager', 'colActivity'] as const;

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('players')}</SectionTitle>

      <Card>
        <Eyebrow>{t('filters')}</Eyebrow>
        <form method="get" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input name="q" defaultValue={params.q ?? ''} placeholder={t('searchPlaceholder')}
                 className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald lg:col-span-2" />
          <input name="position" defaultValue={params.position ?? ''} placeholder={t('colPosition')}
                 className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
          <input name="nationality" defaultValue={params.nationality ?? ''} placeholder={t('colNationality')}
                 className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
          <input name="contractBefore" type="date" defaultValue={params.contractBefore ?? ''}
                 className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
          <button type="submit"
                  className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C]">
            {t('filters')}
          </button>
        </form>
      </Card>

      {rows.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">{t('noResults')}</p></Card>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line-faint">
          <table className="w-full min-w-[1020px] text-sm">
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
                  <td className="px-4 py-3">
                    <a href={`/admin/players/${row.userId}`} className="font-semibold text-ink hover:text-emerald">
                      {[row.firstName, row.lastName].filter(Boolean).join(' ') || row.user.email}
                    </a>
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{age(row.dateOfBirth)}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.nationality ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.primaryPosition ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.currentClub ?? '—'}</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">
                    {row.contractUntil ? format.dateTime(row.contractUntil, { dateStyle: 'medium' }) : '—'}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{row.completionPercent}%</td>
                  <td className="px-4 py-3 tabular-nums text-ink-muted">{row.user._count.ownedDocuments}</td>
                  <td className="px-4 py-3 text-ink-muted">{row.user.responsibleManager?.email ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {row.user.lastLoginAt ? format.relativeTime(row.user.lastLoginAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {nextCursor && (
        <a href={`/admin/players?cursor=${nextCursor}`}
           className="justify-self-start rounded-[10px] border border-line px-5 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-ink-muted hover:border-emerald hover:text-ink">
          →
        </a>
      )}
    </div>
  );
}
