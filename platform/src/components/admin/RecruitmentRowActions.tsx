'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED'] as const;

export function RecruitmentRowActions({
  requestId,
  status,
  assignedToId,
  selfId,
}: {
  requestId: string;
  status: string;
  assignedToId: string | null;
  selfId: string;
}) {
  const ts = useTranslations('statuses');
  const t = useTranslations('recruitment');
  const common = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(nextStatus: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/recruitment/${requestId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
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

  async function assignToMe() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/recruitment/${requestId}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assigneeUserId: selfId }),
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
        defaultValue={status}
        disabled={busy}
        onChange={(ev) => changeStatus(ev.target.value)}
        className="rounded-[8px] border border-line-faint bg-bg-panel px-2.5 py-1.5 text-xs text-ink outline-none focus:border-emerald disabled:opacity-50"
      >
        {STATUSES.map((value) => <option key={value} value={value}>{ts(`rec${value}` as never)}</option>)}
      </select>
      {assignedToId !== selfId && (
        <button type="button" onClick={assignToMe} disabled={busy}
          className="text-[11px] text-emerald hover:underline disabled:opacity-50">
          {t('assign')}
        </button>
      )}
      {error && <p className="text-[11px] text-state-bad">{error}</p>}
    </div>
  );
}
