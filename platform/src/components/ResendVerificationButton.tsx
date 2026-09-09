'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

export function ResendVerificationButton() {
  const t = useTranslations('join');
  const tp = useTranslations('portal');

  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');

  async function handleClick() {
    setState('sending');
    try {
      await fetch('/api/v1/auth/verify-email/resend', { method: 'POST' });
    } finally {
      setState('sent');
    }
  }

  if (state === 'sent') {
    return <span className="text-xs text-emerald">{tp('verificationSent')}</span>;
  }

  return (
    <button type="button" onClick={handleClick} disabled={state === 'sending'}
      className="text-xs text-emerald hover:underline disabled:opacity-60">
      {t('resendVerification')}
    </button>
  );
}
