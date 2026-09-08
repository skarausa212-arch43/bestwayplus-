'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPT = 'application/pdf,image/jpeg,image/png,image/heic,image/heif,.docx';

type Phase = 'idle' | 'requesting' | 'uploading' | 'confirming' | 'done' | 'error';

/**
 * Camera first.
 *
 * On a phone, `capture="environment"` opens the rear camera directly, which is
 * how most identity documents will actually arrive. The desktop file picker is
 * the secondary path, not the primary one.
 *
 * The browser uploads straight to storage with the presigned URL — the file
 * never passes through the application server.
 */
export function DocumentUploader({ documentType }: { documentType: string }) {
  const t = useTranslations('documents');
  const tv = useTranslations('validation');
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function upload(file: File) {
    setError(null);

    if (file.size > MAX_BYTES) {
      setPhase('error');
      setError(tv('fileTooLarge', { max: '15 MB' }));
      return;
    }

    try {
      setPhase('requesting');
      const intent = await fetch('/api/v1/documents/upload-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: documentType,
          name: file.name || `${documentType}.jpg`,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
        }),
      });
      if (!intent.ok) throw await asError(intent);
      const { documentId, url, requiredHeaders } = await intent.json();

      setPhase('uploading');
      const put = await fetch(url, { method: 'PUT', headers: requiredHeaders, body: file });
      if (!put.ok) throw new Error('upload failed');

      setPhase('confirming');
      const confirm = await fetch(`/api/v1/documents/${documentId}/confirm`, { method: 'POST' });
      if (!confirm.ok) throw await asError(confirm);

      setPhase('done');
      startTransition(() => router.refresh());
    } catch (caught) {
      setPhase('error');
      setError(caught instanceof Error ? caught.message : tv('fileType'));
    }
  }

  async function asError(response: Response): Promise<Error> {
    const body = await response.json().catch(() => null);
    const key = body?.error?.messageKey as string | undefined;
    // The server sends an i18n key; the reader's locale decides the wording.
    if (key === 'validation.fileType') return new Error(tv('fileType'));
    if (key === 'validation.fileTooLarge') return new Error(tv('fileTooLarge', { max: '15 MB' }));
    return new Error(tv('fileType'));
  }

  const busy = phase === 'requesting' || phase === 'uploading' || phase === 'confirming';

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
          className="rounded-[10px] bg-emerald-gradient px-5 py-3 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#04150C] disabled:opacity-60"
        >
          {t('takePhoto')}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="rounded-[10px] border border-line px-5 py-3 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink hover:border-emerald disabled:opacity-60"
        >
          {t('chooseFile')}
        </button>
      </div>

      <input
        ref={cameraRef} type="file" accept="image/*" capture="environment" className="sr-only"
        onChange={(event) => { const f = event.target.files?.[0]; if (f) void upload(f); event.target.value = ''; }}
      />
      <input
        ref={fileRef} type="file" accept={ACCEPT} className="sr-only"
        onChange={(event) => { const f = event.target.files?.[0]; if (f) void upload(f); event.target.value = ''; }}
      />

      <p aria-live="polite" className="text-xs text-ink-muted">
        {busy && t('scanPending')}
        {phase === 'error' && <span className="text-state-bad">{error}</span>}
      </p>
    </div>
  );
}
