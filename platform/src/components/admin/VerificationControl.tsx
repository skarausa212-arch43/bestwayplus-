'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const STATUS_VALUES = ['PENDING', 'VERIFIED', 'INFO_REQUIRED', 'REJECTED'] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

/**
 * Granting VERIFIED requires a written basis. The note is not optional
 * decoration — it is the record of why a public credential was issued, and
 * the server rejects the request without it.
 *
 * That requirement used to surface only as a server round-trip: the
 * textarea's placeholder was the same sentence as the error, so an admin
 * who hadn't touched the note yet already saw what looked like a live
 * error, and a rejected submit left the same text on screen whether they'd
 * fixed it or not. It's checked client-side now, worded as a hint until
 * they actually try to submit without one, and clears as soon as they
 * change anything.
 */
export function VerificationControl({ agentUserId, current }: { agentUserId: string; current: string }) {
  const t = useTranslations('admin');
  const ts = useTranslations('statuses');
  const common = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<StatusValue>(current === 'VERIFIED' ? 'VERIFIED' : 'PENDING');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const noteMissing = status === 'VERIFIED' && !note.trim();

  async function submit() {
    if (noteMissing) {
      setError(t('verificationNoteRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/agents/${agentUserId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, note: note.trim() || null }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.messageKey === 'admin.verificationNoteRequired'
          ? t('verificationNoteRequired') : common('errorGeneric'));
        return;
      }
      setOpen(false);
      setNote('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
              className="rounded-[8px] border border-line px-3.5 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-muted hover:border-emerald hover:text-ink">
        {t('verify')}
      </button>
    );
  }

  return (
    <form action={submit} className="grid w-[260px] gap-2">
      <select
        name="status"
        value={status}
        onChange={(ev) => { setStatus(ev.target.value as StatusValue); setError(null); }}
        className="rounded-[8px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald"
      >
        {STATUS_VALUES.map((value) => (
          <option key={value} value={value}>{ts(`ver${value}`)}</option>
        ))}
      </select>
      <textarea
        name="note"
        rows={3}
        value={note}
        onChange={(ev) => { setNote(ev.target.value); setError(null); }}
        placeholder={t('verificationNotePlaceholder')}
        className="rounded-[8px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald"
      />
      {noteMissing && !error && (
        <p className="text-[11px] text-ink-faint">{t('verificationNoteRequired')}</p>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={busy}
                className="rounded-[8px] bg-emerald-gradient px-3.5 py-2 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#04150C] disabled:opacity-60">
          {common('save')}
        </button>
        <button type="button" onClick={() => setOpen(false)}
                className="rounded-[8px] border border-line-faint px-3.5 py-2 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-faint">
          {common('cancel')}
        </button>
      </div>
      {error && <p className="text-[11px] text-state-bad">{error}</p>}
    </form>
  );
}
