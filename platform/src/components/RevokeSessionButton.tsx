'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const t = useTranslations('portal');
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const response = await fetch(`/api/v1/me/sessions/${sessionId}`, { method: 'POST' });
      if (response.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" onClick={handleClick} disabled={busy}
      className="text-xs text-state-bad hover:underline disabled:opacity-50">
      {t('revoke')}
    </button>
  );
}
