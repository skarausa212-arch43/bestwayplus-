'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Assessment = {
  internalRating: number | null; potential: number | null;
  marketability: number | null; reliability: number | null;
  priority: string | null; expectedLevel: string | null;
  comments: string | null; nextAction: string | null;
  followUpDate: Date | string | null;
} | null;

const SCORES = ['internalRating', 'potential', 'marketability', 'reliability'] as const;

/**
 * Internal assessment editor. Rendered only inside the assessment tab, posted
 * only to the dedicated endpoint — there is no path by which these values
 * reach a client-facing query.
 */
export function AssessmentForm({ playerUserId, initial }: { playerUserId: string; initial: Assessment }) {
  const t = useTranslations('admin');
  const common = useTranslations('common');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  async function save(formData: FormData) {
    setState('saving');
    const number = (name: string) => {
      const raw = formData.get(name);
      return raw === null || raw === '' ? null : Number(raw);
    };
    const text = (name: string) => {
      const raw = formData.get(name);
      return raw === null || raw === '' ? null : String(raw);
    };

    const response = await fetch(`/api/v1/admin/players/${playerUserId}/assessment`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        internalRating: number('internalRating'),
        potential: number('potential'),
        marketability: number('marketability'),
        reliability: number('reliability'),
        priority: text('priority'),
        expectedLevel: text('expectedLevel'),
        comments: text('comments'),
        nextAction: text('nextAction'),
        followUpDate: text('followUpDate'),
      }),
    });
    setState(response.ok ? 'saved' : 'error');
  }

  const toDay = (value: Date | string | null) =>
    value ? new Date(value).toISOString().slice(0, 10) : '';

  return (
    <form action={save} className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {SCORES.map((name) => (
          <label key={name} className="grid gap-1.5">
            <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{name}</span>
            <input
              name={name} type="number" min={1} max={10}
              defaultValue={initial?.[name] ?? ''}
              className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2.5 text-sm tabular-nums text-ink outline-none focus:border-emerald"
            />
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1.5">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">priority</span>
          <select name="priority" defaultValue={initial?.priority ?? ''}
                  className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2.5 text-sm text-ink outline-none focus:border-emerald">
            <option value="">—</option>
            {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="grid gap-1.5">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">expected level</span>
          <input name="expectedLevel" defaultValue={initial?.expectedLevel ?? ''}
                 className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
        </label>
        <label className="grid gap-1.5">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">follow-up</span>
          <input name="followUpDate" type="date" defaultValue={toDay(initial?.followUpDate ?? null)}
                 className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
        </label>
      </div>

      <label className="grid gap-1.5">
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">next action</span>
        <input name="nextAction" defaultValue={initial?.nextAction ?? ''}
               className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
      </label>

      <label className="grid gap-1.5">
        <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">comments</span>
        <textarea name="comments" rows={5} defaultValue={initial?.comments ?? ''}
                  className="rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2.5 text-sm text-ink outline-none focus:border-emerald" />
      </label>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={state === 'saving'}
                className="rounded-[10px] bg-emerald-gradient px-5 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
          {common('save')}
        </button>
        <span aria-live="polite" className={`text-xs ${state === 'error' ? 'text-state-bad' : 'text-emerald'}`}>
          {state === 'saved' ? common('saved') : state === 'error' ? common('errorGeneric') : ''}
        </span>
      </div>
      <p className="text-[11px] text-ink-faint">{t('internalOnly')}</p>
    </form>
  );
}
