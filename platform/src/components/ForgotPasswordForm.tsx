'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

export function ForgotPasswordForm() {
  const t = useTranslations('join');
  const tf = useTranslations('forms');
  const tv = useTranslations('validation');

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v1/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email') }),
      });
      const result = await response.json();

      if (response.ok && result.ok) {
        setSent(true);
        return;
      }
      setError(tv((result.error ?? 'email') as never));
    } catch {
      setError(tv('email'));
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <p role="status" className="rounded-[10px] border border-emerald/40 bg-emerald/10 px-4 py-3 text-sm text-emerald">
        {t('forgotPasswordSuccess')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <label htmlFor="fp-email" className="grid gap-2">
        <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {tf('email')}
        </span>
        <input id="fp-email" name="email" type="email" required autoComplete="email"
          className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald" />
      </label>

      {error && (
        <p role="alert" className="rounded-[10px] border border-state-bad/40 bg-state-bad/10 px-4 py-3 text-sm text-state-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}
        className="mt-2 justify-self-start rounded-[10px] bg-emerald-gradient px-6 py-3.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#04150C] disabled:opacity-60">
        {t('forgotPasswordSubmit')}
      </button>
    </form>
  );
}
