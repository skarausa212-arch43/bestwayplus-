import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listTasks } from '@/modules/admin/tasks';
import { listStaff } from '@/modules/admin/staff';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { CreateTaskForm } from '@/components/admin/CreateTaskForm';
import { TaskRowActions } from '@/components/admin/TaskRowActions';
import type { TaskStatus } from '@prisma/client';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  OPEN: 'info', IN_PROGRESS: 'positive', BLOCKED: 'warning', DONE: 'neutral', CANCELLED: 'danger',
};

export default async function AdminTasks({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; mine?: string }>;
}) {
  const session = await getSessionUser();
  if (!session) return null;

  const { status, mine } = await searchParams;
  const admin = await getTranslations('admin');
  const t = await getTranslations('tasks');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();

  const [tasks, staff] = await Promise.all([
    listTasks(session, {
      status: status as TaskStatus | undefined,
      assigneeUserId: mine === 'true' ? session.userId : undefined,
    }),
    listStaff(session).catch(() => []), // non-SUPER_ADMIN can still manage tasks but not list staff
  ]);

  const assigneeOptions = staff.length > 0 ? staff : [{ id: session.userId, email: session.email }];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        <SectionTitle>{admin('tasks')}</SectionTitle>

        <Card>
          <Eyebrow>{admin('filters')}</Eyebrow>
          <form method="get" className="mt-4 flex flex-wrap items-center gap-3">
            <select name="status" defaultValue={status ?? ''}
                    className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-2.5 text-sm text-ink outline-none focus:border-emerald">
              <option value="">—</option>
              {['OPEN', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED'].map((value) => (
                <option key={value} value={value}>{ts(`task${value}` as never)}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-xs text-ink-muted">
              <input type="checkbox" name="mine" value="true" defaultChecked={mine === 'true'} className="h-4 w-4 accent-emerald" />
              {admin('openTasks')}
            </label>
            <button type="submit"
                    className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C]">
              {admin('filters')}
            </button>
          </form>
        </Card>

        {tasks.length === 0 ? (
          <Card><p className="text-sm text-ink-muted">{t('noTasks')}</p></Card>
        ) : (
          <ul className="grid gap-3">
            {tasks.map((task) => (
              <Card as="li" key={task.id}>
                <div className="flex flex-wrap items-start justify-between gap-5">
                  <div className="min-w-0">
                    <p className="font-display text-base font-extrabold text-ink">{task.title}</p>
                    {task.description && <p className="mt-1 text-xs text-ink-muted">{task.description}</p>}
                    <p className="mt-2 text-xs text-ink-faint">
                      {task.assignee?.email ?? t('unassigned')}
                      {task.relatedUser && ` · ${task.relatedUser.email}`}
                      {task.dueDate && ` · ${format.dateTime(task.dueDate, { dateStyle: 'medium' })}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Pill tone={TONE[task.status] ?? 'neutral'}>{ts(`task${task.status}` as never)}</Pill>
                    <TaskRowActions taskId={task.id} status={task.status} />
                  </div>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <Eyebrow>{t('createTask')}</Eyebrow>
        <div className="mt-4"><CreateTaskForm staff={assigneeOptions} selfId={session.userId} /></div>
      </Card>
    </div>
  );
}
