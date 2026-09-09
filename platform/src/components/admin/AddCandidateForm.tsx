'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

export function AddCandidateForm({ opportunityId }: { opportunityId: string }) {
  const t = useTranslations('opportunities');
  const common = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/opportunities/${opportunityId}/participants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.get('email') }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(
          body?.error?.messageKey === 'opportunities.candidateNotFound' ? t('candidateNotFound')
          : body?.error?.messageKey === 'opportunities.invalidCandidate' ? t('invalidCandidate')
          : body?.error?.messageKey === 'opportunities.alreadyParticipant' ? t('alreadyParticipant')
          : common('errorGeneric'),
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="grid gap-2">
      <input name="email" type="email" required placeholder={t('candidateEmail')}
             className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald" />
      <button type="submit" disabled={busy}
              className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
        {t('addCandidate')}
      </button>
      {error && <p className="text-xs text-state-bad">{error}</p>}
    </form>
  );
}
