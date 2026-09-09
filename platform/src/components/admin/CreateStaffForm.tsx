'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'] as const;

/**
 * No email delivery exists in this codebase to send an invite link, so the
 * account is created with a server-generated password returned once in the
 * response — same "shown once, copy it now" pattern as share links. Relay it
 * to the new colleague out of band (in person, an existing chat) and tell
 * them to change it once they're in; there is no password-reset flow yet
 * either, so losing it before that means asking a super admin to recreate it.
 */
export function CreateStaffForm() {
  const t = useTranslations('admin');
  const f = useTranslations('forms');
  const tv = useTranslations('validation');
  const common = useTranslations('common');
  const router = useRouter();
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/v1/admin/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: formData.get('email'), role: formData.get('role') }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const key = body?.error?.messageKey as string | undefined;
        setError(
          key === 'validation.emailTaken' ? tv('emailTaken')
          : key === 'admin.lastSuperAdmin' ? t('lastSuperAdmin')
          : common('errorGeneric'),
        );
        return;
      }
      setCreated({ email: body.email, password: body.password });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form action={submit} className="grid gap-3 text-sm">
      <input name="email" type="email" required placeholder={f('email')}
             className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald" />
      <select name="role" defaultValue="MANAGER"
              className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald">
        {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      <button type="submit" disabled={busy}
              className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
        {t('createStaffAccount')}
      </button>

      {error && <p className="text-xs text-state-bad">{error}</p>}
      {created && (
        <div className="grid gap-2 rounded-[10px] border border-emerald/40 bg-emerald/10 p-3">
          <p className="text-[11px] text-emerald">{t('staffCreated')}</p>
          <p className="text-xs text-ink">{created.email}</p>
          <code className="break-all text-[11px] text-ink">{created.password}</code>
        </div>
      )}
    </form>
  );
}
