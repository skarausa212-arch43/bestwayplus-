import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listForStaff } from '@/modules/recruitment/service';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { RecruitmentRowActions } from '@/components/admin/RecruitmentRowActions';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  OPEN: 'info', IN_PROGRESS: 'positive', CLOSED: 'neutral', CANCELLED: 'danger',
};

export default async function AdminRecruitment({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mine?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) return null;

  const { status, mine } = await searchParams;
  const admin = await getTranslations('admin');
  const t = await getTranslations('recruitment');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();

  const requests = await listForStaff(session, {
    status,
    assigneeUserId: mine === 'true' ? session.userId : undefined,
  });

  return (
    <div className="grid gap-4">
      <SectionTitle>{admin('recruitment')}</SectionTitle>

      <Card>
        <Eyebrow>{admin('filters')}</Eyebrow>
        <form method="get" className="mt-4 flex flex-wrap items-center gap-3">
          <select name="status" defaultValue={status ?? ''}
                  className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald">
            <option value="">—</option>
            {['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED'].map((value) => (
              <option key={value} value={value}>{ts(`rec${value}` as never)}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input type="checkbox" name="mine" value="true" defaultChecked={mine === 'true'} className="h-4 w-4 accent-emerald" />
            {t('mine')}
          </label>
          <button type="submit"
                  className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C]">
            {admin('filters')}
          </button>
        </form>
      </Card>

      {requests.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">{t('noRequests')}</p></Card>
      ) : (
        <ul className="grid gap-3">
          {requests.map((req) => (
            <Card as="li" key={req.id}>
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="font-display text-base font-extrabold text-ink">
                    {req.position || t('newRequest')}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">{req.clubUser.email}</p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {req.assignedTo ? `${t('assignedTo')}: ${req.assignedTo.email}` : t('assignedToNoOne')}
                    {req.deadline && ` · ${format.dateTime(req.deadline, { dateStyle: 'medium' })}`}
                    {req.salaryBudget && ` · ${req.salaryBudget}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Pill tone={TONE[req.status] ?? 'neutral'}>{ts(`rec${req.status}` as never)}</Pill>
                  <RecruitmentRowActions
                    requestId={req.id}
                    status={req.status}
                    assignedToId={req.assignedTo?.id ?? null}
                    selfId={session.userId}
                  />
                </div>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
