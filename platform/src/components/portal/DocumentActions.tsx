'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

/**
 * A download is a request, not a link: the client asks the API, which
 * authorises, checks the scan status, writes an access-log row and only then
 * returns a 60-second signed URL. There is no href to copy or share.
 */
export function DocumentActions({
  documentId, canDownload, canDelete,
}: {
  documentId: string;
  canDownload: boolean;
  canDelete: boolean;
}) {
  const t = useTranslations('documents');
  const common = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function download() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/documents/${documentId}/download-url`, { method: 'POST' });
      if (!response.ok) throw new Error();
      const { url } = await response.json();
      window.location.assign(url);
    } catch {
      setMessage(common('errorGeneric'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/v1/documents/${documentId}`, { method: 'DELETE' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setMessage(body?.error?.messageKey === 'documents.deleteLocked' ? t('deleteLocked') : common('errorGeneric'));
        return;
      }
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <button
          type="button" onClick={download} disabled={busy || !canDownload}
          className="rounded-[8px] border border-line px-3 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-muted hover:border-emerald hover:text-ink disabled:opacity-40"
        >
          {t('download')}
        </button>
        {canDelete && (
          <button
            type="button" onClick={remove} disabled={busy}
            className="rounded-[8px] border border-line-faint px-3 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint hover:border-state-bad hover:text-state-bad disabled:opacity-40"
          >
            {common('delete')}
          </button>
        )}
      </div>
      {message && <p className="max-w-[28ch] text-right text-[11px] text-state-warn">{message}</p>}
      {!canDownload && <p className="text-[11px] text-ink-faint">{t('scanPending')}</p>}
    </div>
  );
}
