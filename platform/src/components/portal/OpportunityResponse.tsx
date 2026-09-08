'use client';

import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import { Card } from '@/components/ui';

/**
 * The client-side half of the stage machine. It offers only the transitions
 * the server also allows — but the server is the one that decides, so a
 * crafted request gets the same answer as a disabled button.
 */
const AVAILABLE: Record<string, Array<'INTERESTED' | 'DECLINE' | 'INFO_PROVIDED'>> = {
  NEW: ['INTERESTED', 'DECLINE'],
  INFO_REQUESTED: ['INFO_PROVIDED'],
};

export function OpportunityResponse({ opportunityId, stage }: { opportunityId: string; stage: string }) {
  const t = useTranslations('opportunities');
  const common = useTranslations('common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const actions = AVAILABLE[stage] ?? [];
  if (actions.length === 0) return null;

  async function respond(response: 'INTERESTED' | 'DECLINE' | 'INFO_PROVIDED') {
    setBusy(true);
    setMessage(null);
    try {
      const result = await fetch(`/api/v1/opportunities/${opportunityId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      });
      if (!result.ok) {
        const body = await result.json().catch(() => null);
        setMessage(body?.error?.messageKey === 'opportunities.stageNotAllowed'
          ? t('stageNotAllowed') : common('errorGeneric'));
        return;
      }
      setMessage(t('responded'));
      startTransition(() => router.refresh());
    } finally {
      setBusy(false);
    }
  }

  const LABEL = { INTERESTED: t('interested'), DECLINE: t('decline'), INFO_PROVIDED: t('provideInfo') };

  return (
    <Card>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => (
          <button
            key={action}
            type="button"
            disabled={busy}
            onClick={() => respond(action)}
            className={
              action === 'DECLINE'
                ? 'rounded-[10px] border border-line px-5 py-3 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-ink-muted hover:border-state-bad hover:text-state-bad disabled:opacity-50'
                : 'rounded-[10px] bg-emerald-gradient px-5 py-3 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#04150C] disabled:opacity-50'
            }
          >
            {LABEL[action]}
          </button>
        ))}
      </div>
      {message && <p aria-live="polite" className="mt-3 text-sm text-emerald">{message}</p>}
    </Card>
  );
}
