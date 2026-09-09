'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

export function SignInForm() {
  const t = useTranslations('join');
  const tf = useTranslations('forms');
  const tv = useTranslations('validation');
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: form.get('email'), password: form.get('password') }),
      });
      const result = await response.json();

      if (response.ok && result.ok) {
        router.push('/portal');
        router.refresh();
        return;
      }
      setError(tv((result.error ?? 'invalidCredentials') as never));
    } catch {
      setError(tv('invalidCredentials'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-4">
      <label htmlFor="si-email" className="grid gap-2">
        <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {tf('email')}
        </span>
        <input id="si-email" name="email" type="email" required autoComplete="email"
          className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald" />
      </label>

      <label htmlFor="si-password" className="grid gap-2">
        <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {tf('password')}
        </span>
        <input id="si-password" name="password" type="password" required autoComplete="current-password"
          className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald" />
      </label>

      {error && (
        <p role="alert" className="rounded-[10px] border border-state-bad/40 bg-state-bad/10 px-4 py-3 text-sm text-state-bad">
          {error}
        </p>
      )}

      <button type="submit" disabled={submitting}
        className="mt-2 justify-self-start rounded-[10px] bg-emerald-gradient px-6 py-3.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#04150C] disabled:opacity-60">
        {t('signInSubmit')}
      </button>
    </form>
  );
}
