'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const STATUS_VALUES = ['PENDING', 'VERIFIED', 'INFO_REQUIRED', 'REJECTED'] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

/**
 * Same shape as VerificationControl, minus the note: ClubProfile has no
 * verificationNote column (only AgentProfile does), so there is nothing to
 * require or persist beyond the status itself.
 */
export function ClubVerificationControl({ clubUserId, current }: { clubUserId: string; current: string }) {
  const t = useTranslations('admin');
  const ts = useTranslations('statuses');
  const common = useTranslations('common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<StatusValue>(current === 'VERIFIED' ? 'VERIFIED' : 'PENDING');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/clubs/${clubUserId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        setError(common('errorGeneric'));
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
    <form action={submit} className="grid w-[220px] gap-2">
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
