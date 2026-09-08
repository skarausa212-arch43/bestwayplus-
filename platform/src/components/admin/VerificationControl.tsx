'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

/**
 * Granting VERIFIED requires a written basis. The note is not optional
 * decoration — it is the record of why a public credential was issued, and
 * the server rejects the request without it.
 */
export function VerificationControl({ agentUserId, current }: { agentUserId: string; current: string }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/agents/${agentUserId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: formData.get('status'), note: formData.get('note') }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.messageKey === 'admin.verificationNoteRequired'
          ? t('verificationNoteRequired') : common('errorGeneric'));
        return;
      }
      setOpen(false);
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
      <select name="status" defaultValue={current === 'VERIFIED' ? 'VERIFIED' : 'PENDING'}
              className="rounded-[8px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald">
        {['PENDING', 'VERIFIED', 'INFO_REQUIRED', 'REJECTED'].map((value) => (
          <option key={value} value={value}>{value}</option>
        ))}
      </select>
      <textarea name="note" rows={3} placeholder={t('verificationNoteRequired')}
                className="rounded-[8px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald" />
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
