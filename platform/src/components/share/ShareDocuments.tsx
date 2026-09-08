'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Even inside a share view a document is a request, not a link. The server
 * re-opens the link, re-checks the allow-list and writes an access-log row
 * against the link before it issues a 60-second URL.
 */
export function ShareDocuments({
  token, password, documents,
}: {
  token: string;
  password: string | null;
  documents: Array<{ id: string; type: string; name: string }>;
}) {
  const t = useTranslations('documents');
  const common = useTranslations('common');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function open(documentId: string) {
    setBusy(documentId);
    setError(null);
    try {
      const response = await fetch(`/api/share/${token}/documents/${documentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!response.ok) {
        setError(common('errorGeneric'));
        return;
      }
      const { url } = await response.json();
      window.location.assign(url);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-2">
      {documents.map((document) => (
        <button
          key={document.id}
          type="button"
          disabled={busy === document.id}
          onClick={() => open(document.id)}
          className="flex items-center justify-between gap-4 rounded-[10px] border border-line-faint px-4 py-3 text-left text-sm text-ink transition-colors hover:border-emerald disabled:opacity-50"
        >
          <span>{t(`type${document.type}`)}</span>
          <span className="font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-emerald">
            {t('download')}
          </span>
        </button>
      ))}
      {error && <p className="text-xs text-state-bad">{error}</p>}
    </div>
  );
}
