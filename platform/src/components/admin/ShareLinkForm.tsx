'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

const SECTIONS = ['identity', 'football', 'career', 'links'] as const;

/**
 * Composing an outbound link.
 *
 * Nothing is ticked by default and the control is disabled without the
 * player's sharing consent — but the server refuses regardless, so the
 * disabled state is a courtesy, not the control.
 */
export function ShareLinkForm({ playerUserId, consentGranted }: { playerUserId: string; consentGranted: boolean }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/admin/share-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerUserId,
          sections: Object.fromEntries(SECTIONS.map((name) => [name, formData.get(name) === 'on'])),
          expiresInDays: Number(formData.get('expiresInDays') ?? 14),
          password: formData.get('password') ? String(formData.get('password')) : null,
          recipientLabel: formData.get('recipientLabel') ? String(formData.get('recipientLabel')) : null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.messageKey === 'admin.shareConsentMissing'
          ? t('shareConsentMissing') : common('errorGeneric'));
        return;
      }
      const created = await response.json();
      // Shown once. The plaintext token is never stored, so it cannot be shown again.
      setToken(`${window.location.origin}/share/${created.token}`);
    } finally {
      setBusy(false);
    }
  }

  if (!consentGranted) {
    return <p className="text-xs leading-relaxed text-state-warn">{t('shareConsentMissing')}</p>;
  }

  return (
    <form action={create} className="grid gap-3 text-sm">
      <fieldset className="grid gap-2">
        <legend className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">
          {t('shareSections')}
        </legend>
        {SECTIONS.map((name) => (
          <label key={name} className="flex items-center gap-2.5 text-xs text-ink-muted">
            <input type="checkbox" name={name} className="h-4 w-4 accent-emerald" />
            {name}
          </label>
        ))}
        <p className="text-[11px] text-ink-faint">{t('shareNothingByDefault')}</p>
      </fieldset>

      <label className="grid gap-1.5">
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{t('shareExpiry')}</span>
        <select name="expiresInDays" defaultValue="14"
                className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald">
          {[7, 14, 30, 90].map((days) => <option key={days} value={days}>{t('shareDays', { count: days })}</option>)}
        </select>
      </label>

      <input name="recipientLabel" placeholder={t('shareRecipient')}
             className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald" />
      <input name="password" type="password" placeholder={t('sharePassword')}
             className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald" />

      <button type="submit" disabled={busy}
              className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
        {t('createShareLink')}
      </button>

      {error && <p className="text-xs text-state-bad">{error}</p>}
      {token && (
        <div className="grid gap-2 rounded-[10px] border border-emerald/40 bg-emerald/10 p-3">
          <p className="text-[11px] text-emerald">{t('shareCreated')}</p>
          <code className="break-all text-[11px] text-ink">{token}</code>
        </div>
      )}
    </form>
  );
}
