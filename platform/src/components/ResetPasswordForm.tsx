'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export function ResetPasswordForm({ token }: { token: string | null }) {
  const t = useTranslations('join');
  const tf = useTranslations('forms');
  const tv = useTranslations('validation');
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!token) {
      setError(tv('resetTokenInvalid'));
      return;
    }

    const form = new FormData(event.currentTarget);
    const password = String(form.get('password') ?? '');
    const confirm = String(form.get('confirm') ?? '');
    if (password !== confirm) {
      setError(tv('passwordMismatch'));
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/v1/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = await response.json();

      if (response.ok && result.ok) {
        setDone(true);
        setTimeout(() => router.push('/sign-in'), 2000);
        return;
      }
      setError(tv((result.error ?? 'resetTokenInvalid') as never));
    } catch {
      setError(tv('resetTokenInvalid'));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <p role="status" className="rounded-[10px] border border-emerald/40 bg-emerald/10 px-4 py-3 text-sm text-emerald">
        {t('resetPasswordSuccess')}
      </p>
    );
  }

  if (!token) {
    return (
      <p role="alert" className="rounded-[10px] border border-state-bad/40 bg-state-bad/10 px-4 py-3 text-sm text-state-bad">
        {tv('resetTokenInvalid')}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <label htmlFor="rp-password" className="grid gap-2">
        <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {tf('newPassword')}
        </span>
        <input id="rp-password" name="password" type="password" required autoComplete="new-password" minLength={12}
          className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald" />
        <span className="text-xs text-ink-faint">{tf('passwordHint')}</span>
      </label>

      <label htmlFor="rp-confirm" className="grid gap-2">
        <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {tf('confirmPassword')}
        </span>
        <input id="rp-confirm" name="confirm" type="password" required autoComplete="new-password" minLength={12}
          className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald" />
      </label>

      {error && (
        <p role="alert" className="rounded-[10px] border border-state-bad/40 bg-state-bad/10 px-4 py-3 text-sm text-state-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}
        className="mt-2 justify-self-start rounded-[10px] bg-emerald-gradient px-6 py-3.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#04150C] disabled:opacity-60">
        {t('resetPasswordSubmit')}
      </button>
    </form>
  );
}
