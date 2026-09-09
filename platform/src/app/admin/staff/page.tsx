import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { listStaff } from '@/modules/admin/staff';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { CreateStaffForm } from '@/components/admin/CreateStaffForm';
import { StaffRowActions } from '@/components/admin/StaffRowActions';

export const dynamic = 'force-dynamic';

export default async function AdminStaff() {
  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('admin');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();

  // staff:manage is SUPER_ADMIN-only. The layout lets any staff member into
  // /admin, so this page enforces its own boundary rather than relying on
  // the nav being hidden from everyone else.
  if (session.role !== 'SUPER_ADMIN') {
    return <Card><p className="text-sm text-ink-muted">{t('noAccess')}</p></Card>;
  }

  const staff = await listStaff(session);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        <SectionTitle>{t('staff')}</SectionTitle>
        <ul className="grid gap-3">
          {staff.map((member) => (
            <Card as="li" key={member.id}>
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="font-display text-base font-extrabold text-ink">{member.email}</p>
                  <p className="mt-1 text-xs text-ink-muted">{member.role}</p>
                  <p className="mt-2 text-xs text-ink-faint">
                    {format.dateTime(member.createdAt, { dateStyle: 'medium' })}
                    {member.lastLoginAt && ` · ${format.relativeTime(member.lastLoginAt)}`}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Pill tone={member.status === 'SUSPENDED' ? 'danger' : 'positive'}>{ts(`acc${member.status}`)}</Pill>
                  <StaffRowActions
                    userId={member.id}
                    // The query filters to STAFF_ROLES only; the Prisma type
                    // still carries the full Role union, so narrow it here.
                    role={member.role as 'SUPER_ADMIN' | 'ADMIN' | 'MANAGER'}
                    status={member.status}
                    isSelf={member.id === session.userId}
                  />
                </div>
              </div>
            </Card>
          ))}
        </ul>
      </div>

      <Card>
        <Eyebrow>{t('createStaffAccount')}</Eyebrow>
        <div className="mt-4"><CreateStaffForm /></div>
      </Card>
    </div>
  );
}
