'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const STAGES = [
  'NEW', 'PROFILE_UNDER_REVIEW', 'SUBMITTED', 'CLUB_REVIEWING',
  'INFO_REQUESTED', 'NEGOTIATION', 'CLOSED', 'SUCCESSFUL',
] as const;

export function ParticipantStageControl({ participantId, current }: { participantId: string; current: string }) {
  const ts = useTranslations('statuses');
  const common = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStage(stage: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/opportunities/participants/${participantId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage }),
      });
      if (!response.ok) {
        setError(common('errorGeneric'));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid justify-items-end gap-1">
      <select
        defaultValue={current}
        disabled={busy}
        onChange={(ev) => changeStage(ev.target.value)}
        className="rounded-[8px] border border-line-faint bg-bg-panel px-2.5 py-1.5 text-xs text-ink outline-none focus:border-emerald disabled:opacity-50"
      >
        {STAGES.map((stage) => <option key={stage} value={stage}>{ts(`stage${stage}` as never)}</option>)}
      </select>
      {error && <p className="text-[11px] text-state-bad">{error}</p>}
    </div>
  );
}
