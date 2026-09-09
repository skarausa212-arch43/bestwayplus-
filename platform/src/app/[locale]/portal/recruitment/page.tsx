import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { listOwn } from '@/modules/recruitment/service';
import { Card, Eyebrow, SectionTitle, Pill } from '@/components/ui';
import { CreateRecruitmentForm } from '@/components/CreateRecruitmentForm';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'neutral' | 'positive' | 'warning' | 'danger' | 'info'> = {
  OPEN: 'info', IN_PROGRESS: 'positive', CLOSED: 'neutral', CANCELLED: 'danger',
};

export default async function PortalRecruitmentPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('recruitment');
  const portal = await getTranslations('portal');
  const ts = await getTranslations('statuses');
  const format = await getFormatter();

  const requests = await listOwn(session);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="grid gap-4">
        <SectionTitle>{portal('recruitment')}</SectionTitle>

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
                    <p className="mt-2 text-xs text-ink-faint">
                      {req.assignedTo ? `${t('assignedTo')}: ${req.assignedTo.email}` : t('assignedToNoOne')}
                      {req.deadline && ` · ${format.dateTime(req.deadline, { dateStyle: 'medium' })}`}
                    </p>
                  </div>
                  <Pill tone={TONE[req.status] ?? 'neutral'}>{ts(`rec${req.status}` as never)}</Pill>
                </div>
              </Card>
            ))}
          </ul>
        )}
      </div>

      <Card>
        <Eyebrow>{t('newRequest')}</Eyebrow>
        <div className="mt-4"><CreateRecruitmentForm /></div>
      </Card>
    </div>
  );
}
