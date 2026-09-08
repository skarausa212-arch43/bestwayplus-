import { getFormatter, getTranslations, setRequestLocale } from 'next-intl/server';
import type { AppLocale } from '@/i18n/routing';
import { getSessionUser } from '@/modules/auth/session';
import { listOwnDocuments } from '@/modules/documents/queries';
import { Card, Eyebrow, SectionTitle, EmptyState } from '@/components/ui';
import { DocumentStatusPill } from '@/components/portal/StatusPill';
import { DocumentUploader } from '@/components/portal/DocumentUploader';
import { DocumentActions } from '@/components/portal/DocumentActions';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ type?: string; status?: string }>;
}) {
  const { locale } = await params;
  const { type, status } = await searchParams;
  setRequestLocale(locale as AppLocale);

  const session = await getSessionUser();
  if (!session) return null;

  const t = await getTranslations('documents');
  const format = await getFormatter();
  const all = await listOwnDocuments(session);
  const documents = all.filter(
    (document) => (!type || document.type === type) && (!status || document.status === status),
  );

  return (
    <div className="grid gap-6">
      <div>
        <SectionTitle>{t('title')}</SectionTitle>
        <p className="mt-3 max-w-[70ch] text-sm text-ink-muted">{t('intro')}</p>
      </div>

      <Card>
        <Eyebrow>{t('upload')}</Eyebrow>
        <div className="mt-4">
          <DocumentUploader documentType={type ?? 'OTHER'} />
        </div>
      </Card>

      {documents.length === 0 ? (
        <EmptyState>{t('empty')}</EmptyState>
      ) : (
        <ul className="grid gap-3">
          {documents.map((document) => (
            <Card as="li" key={document.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-display text-sm font-bold text-ink">{t(`type${document.type}`)}</p>
                  <p className="mt-1 truncate text-xs text-ink-faint">{document.name}</p>
                  <p className="mt-2 text-xs text-ink-muted">
                    {t('uploadDate')}: {format.dateTime(document.createdAt, { dateStyle: 'medium' })}
                    {document.expiryDate && (
                      <> · {t('expiryDate')}: {format.dateTime(document.expiryDate, { dateStyle: 'medium' })}</>
                    )}
                  </p>
                  {document.adminComment && (
                    <p className="mt-2 rounded-[8px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink-muted">
                      <span className="text-emerald">{t('reviewerComment')}: </span>
                      {document.adminComment}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-3">
                  <DocumentStatusPill status={document.status} />
                  <DocumentActions
                    documentId={document.id}
                    canDownload={document.scanStatus === 'CLEAN'}
                    canDelete={!document.deleteLocked && document.status !== 'APPROVED'}
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
