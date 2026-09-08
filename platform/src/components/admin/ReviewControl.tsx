'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

type Decision = 'APPROVED' | 'ACTION_REQUIRED' | 'REJECTED';

export function ReviewControl({ documentId, canApprove }: { documentId: string; canApprove: boolean }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const router = useRouter();
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function decide(decision: Decision) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/documents/${documentId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment: comment || null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.messageKey === 'admin.reviewCommentRequired'
          ? t('reviewCommentRequired') : common('errorGeneric'));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid w-[300px] gap-2">
      <textarea
        rows={2}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder={t('reviewComment')}
        className="rounded-[8px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || !canApprove} onClick={() => decide('APPROVED')}
                className="rounded-[8px] bg-emerald-gradient px-3.5 py-2 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#04150C] disabled:opacity-40">
          {t('approve')}
        </button>
        <button type="button" disabled={busy} onClick={() => decide('ACTION_REQUIRED')}
                className="rounded-[8px] border border-state-warn/50 px-3.5 py-2 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-state-warn disabled:opacity-40">
          {t('requestChanges')}
        </button>
        <button type="button" disabled={busy} onClick={() => decide('REJECTED')}
                className="rounded-[8px] border border-line-faint px-3.5 py-2 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint hover:border-state-bad hover:text-state-bad disabled:opacity-40">
          {t('reject')}
        </button>
      </div>
      {error && <p className="text-[11px] text-state-bad">{error}</p>}
    </div>
  );
}
