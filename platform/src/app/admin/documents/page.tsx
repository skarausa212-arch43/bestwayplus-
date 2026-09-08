import { getFormatter, getTranslations } from 'next-intl/server';
import { getSessionUser } from '@/modules/auth/session';
import { reviewQueue } from '@/modules/admin/documents';
import { Card, SectionTitle } from '@/components/ui';
import { ReviewControl } from '@/components/admin/ReviewControl';

export const dynamic = 'force-dynamic';

export default async function AdminDocuments() {
  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('admin');
  const td = await getTranslations('documents');
  const format = await getFormatter();
  const queue = await reviewQueue(session);

  return (
    <div className="grid gap-6">
      <SectionTitle>{t('documentsToReview')}</SectionTitle>

      {queue.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">{t('noResults')}</p></Card>
      ) : (
        <ul className="grid gap-3">
          {queue.map((document) => (
            <Card as="li" key={document.id}>
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-ink">{td(`type${document.type}`)}</p>
                  <p className="mt-1 truncate text-xs text-ink-faint">{document.name}</p>
                  <p className="mt-2 text-xs text-ink-muted">
                    <a href={`/admin/players/${document.owner.id}`} className="hover:text-emerald">
                      {document.owner.email}
                    </a>
                    {' · '}
                    {format.dateTime(document.createdAt, { dateStyle: 'medium' })}
                    {' · '}
                    {Math.round(document.sizeBytes / 1024)} KB
                  </p>
                  {/* Approval of an unscanned file is refused by the service. */}
                  {document.scanStatus !== 'CLEAN' && (
                    <p className="mt-2 text-xs text-state-warn">{td('scanPending')}</p>
                  )}
                </div>
                <ReviewControl documentId={document.id} canApprove={document.scanStatus === 'CLEAN'} />
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
