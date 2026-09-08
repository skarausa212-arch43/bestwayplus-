import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { listOwnRequests } from '@/modules/documents/queries';
import { Card, Eyebrow, SectionTitle, EmptyState } from '@/components/ui';
import { DocumentUploader } from '@/components/portal/DocumentUploader';

export const dynamic = 'force-dynamic';

export default async function RequestsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('portal');
  const td = await getTranslations('documents');
  const format = await getFormatter();
  const requests = await listOwnRequests(session);

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('requests')}</SectionTitle>

      {requests.length === 0 ? (
        <EmptyState>{t('nothingPending')}</EmptyState>
      ) : (
        <ul className="grid gap-4">
          {requests.map((request) => (
            <Card as="li" key={request.id} className="border-l-2 border-l-state-warn">
              <Eyebrow>{td(`type${request.type}`)}</Eyebrow>
              {request.message && <p className="mt-3 text-sm text-ink">{request.message}</p>}
              {request.dueDate && (
                <p className="mt-2 text-xs text-ink-muted">
                  {format.dateTime(request.dueDate, { dateStyle: 'medium' })}
                </p>
              )}
              {/* Upload lands directly against the requested type, so the
                  request closes itself when the document is approved. */}
              <div className="mt-4">
                <DocumentUploader documentType={request.type} />
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
