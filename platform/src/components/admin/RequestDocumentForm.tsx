'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const TYPES = [
  'PASSPORT_ID', 'PLAYER_CV', 'CLUB_CONTRACT', 'REPRESENTATION_AGREEMENT',
  'MEDICAL', 'VISA', 'RESIDENCE_PERMIT', 'INSURANCE', 'BANK_DETAILS', 'OTHER',
] as const;

export function RequestDocumentForm({ targetUserId }: { targetUserId: string }) {
  const t = useTranslations('admin');
  const td = useTranslations('documents');
  const common = useTranslations('common');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  async function send(formData: FormData) {
    setState('sending');
    const response = await fetch('/api/v1/admin/document-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetUserId,
        type: formData.get('type'),
        message: formData.get('message'),
        dueDate: formData.get('dueDate') || null,
      }),
    });
    setState(response.ok ? 'sent' : 'error');
  }

  return (
    <form action={send} className="grid gap-3 text-sm">
      <select name="type" required
              className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald">
        {TYPES.map((type) => <option key={type} value={type}>{td(`type${type}`)}</option>)}
      </select>
      <textarea name="message" rows={3} required placeholder={t('reviewComment')}
                className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald" />
      <input name="dueDate" type="date"
             className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald" />
      <button type="submit" disabled={state === 'sending'}
              className="rounded-[10px] border border-line px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-ink hover:border-emerald disabled:opacity-60">
        {t('requestDocument')}
      </button>
      <span aria-live="polite" className={`text-xs ${state === 'error' ? 'text-state-bad' : 'text-emerald'}`}>
        {state === 'sent' ? common('saved') : state === 'error' ? common('errorGeneric') : ''}
      </span>
    </form>
  );
}
