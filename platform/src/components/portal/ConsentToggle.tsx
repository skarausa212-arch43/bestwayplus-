'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

/**
 * Grant and withdrawal are the same endpoint with a boolean, because both are
 * events that must be recorded — a withdrawal is never a silent delete.
 */
export function ConsentToggle({ type, granted }: { type: string; granted: boolean }) {
  const t = useTranslations('consent');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, startTransition] = useTransition();

  async function set(next: boolean) {
    setBusy(true);
    try {
      await fetch('/api/v1/me/consents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, granted: next }),
      });
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => set(!granted)}
      aria-pressed={granted}
      className={
        'rounded-[10px] px-5 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.18em] disabled:opacity-50 ' +
        (granted
          ? 'border border-line text-ink-muted hover:border-state-bad hover:text-state-bad'
          : 'bg-emerald-gradient text-[#04150C]')
      }
    >
      {granted ? t('withdraw') : t('grant')}
    </button>
  );
}
