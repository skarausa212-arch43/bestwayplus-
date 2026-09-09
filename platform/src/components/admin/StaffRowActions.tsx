'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;
type Role = (typeof ROLES)[number];

export function StaffRowActions({
  userId, role, status, isSelf,
}: {
  userId: string;
  role: Role;
  status: string;
  isSelf: boolean;
}) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeRole(nextRole: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/admin/staff/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: nextRole }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.messageKey === 'admin.lastSuperAdmin' ? t('lastSuperAdmin') : common('errorGeneric'));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus() {
    setBusy(true);
    setError(null);
    try {
      const nextStatus = status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
      const response = await fetch(`/api/v1/admin/staff/${userId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.messageKey === 'admin.lastSuperAdmin' ? t('lastSuperAdmin') : common('errorGeneric'));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <select
          defaultValue={role}
          disabled={busy || isSelf}
          onChange={(ev) => changeRole(ev.target.value)}
          className="rounded-[8px] border border-line-faint bg-bg-panel px-2.5 py-1.5 text-xs text-ink outline-none focus:border-emerald disabled:opacity-50"
        >
          {ROLES.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
        <button
          type="button"
          disabled={busy || isSelf}
          onClick={toggleStatus}
          className="rounded-[8px] border border-line px-3 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-ink-muted hover:border-emerald hover:text-ink disabled:opacity-50"
        >
          {status === 'SUSPENDED' ? t('activate') : t('suspend')}
        </button>
      </div>
      {error && <p className="text-[11px] text-state-bad">{error}</p>}
    </div>
  );
}
