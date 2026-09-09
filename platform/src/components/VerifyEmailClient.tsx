'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';

type State = 'pending' | 'ok' | 'failed';

export function VerifyEmailClient({ token }: { token: string | null }) {
  const t = useTranslations('join');
  const [state, setState] = useState<State>(token ? 'pending' : 'failed');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    fetch('/api/v1/auth/verify-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then((response) => response.json())
      .then((result) => {
        if (!cancelled) setState(result.ok ? 'ok' : 'failed');
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });

    return () => { cancelled = true; };
  }, [token]);

  if (state === 'pending') {
    return <p className="text-ink-muted">{t('verifyEmailPending')}</p>;
  }

  if (state === 'ok') {
    return (
      <div className="grid gap-4">
        <p role="status" className="rounded-[10px] border border-emerald/40 bg-emerald/10 px-4 py-3 text-sm text-emerald">
          {t('verifyEmailSuccess')}
        </p>
        <Link href="/portal" className="justify-self-start text-sm text-emerald hover:underline">
          {t('signInSubmit')}
        </Link>
      </div>
    );
  }

  return (
    <p role="alert" className="rounded-[10px] border border-state-bad/40 bg-state-bad/10 px-4 py-3 text-sm text-state-bad">
      {t('verifyEmailFailed')}
    </p>
  );
}
