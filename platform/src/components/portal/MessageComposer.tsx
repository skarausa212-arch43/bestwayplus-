'use client';

import { useRef, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Card } from '@/components/ui';

export function MessageComposer({ conversationId }: { conversationId: string }) {
  const t = useTranslations('messages');
  const common = useTranslations('common');
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function send(formData: FormData) {
    const body = String(formData.get('body') ?? '').trim();
    if (!body) return;

    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        setError(common('errorGeneric'));
        return;
      }
      formRef.current?.reset();
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form ref={formRef} action={send} className="grid gap-3">
        <textarea
          name="body" rows={3} required placeholder={t('placeholder')}
          className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-sm text-ink outline-none focus:border-emerald"
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-ink-faint">{t('attachmentNote')}</p>
          <button type="submit" disabled={busy}
                  className="rounded-[10px] bg-emerald-gradient px-5 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
            {t('send')}
          </button>
        </div>
        {error && <p className="text-xs text-state-bad">{error}</p>}
      </form>
    </Card>
  );
}
