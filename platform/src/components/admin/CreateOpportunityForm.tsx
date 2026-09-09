'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const FOOT_VALUES = ['', 'LEFT', 'RIGHT', 'BOTH'] as const;

const TRANSFER_OPTIONS = [
  { value: '', labelKey: 'notDisclosed' },
  { value: 'TRANSFER', labelKey: 'typeTRANSFER' },
  { value: 'LOAN', labelKey: 'typeLOAN' },
  { value: 'FREE_AGENT', labelKey: 'typeFREE_AGENT' },
];

const VISIBILITY_OPTIONS = ['PRIVATE', 'SELECTED', 'VERIFIED_USERS'] as const;
const STATUS_OPTIONS = ['DRAFT', 'OPEN', 'ON_HOLD', 'CLOSED'] as const;

/**
 * Only PRIVATE visibility is actually wired to anything a candidate can
 * reach — they see an opportunity because a staff member attached them as a
 * participant, not by browsing. SELECTED/VERIFIED_USERS exist on the model
 * but nothing reads them yet, so this still offers all three (the column
 * accepts them) without claiming the other two do more than they do.
 */
export function CreateOpportunityForm() {
  const t = useTranslations('opportunities');
  const f = useTranslations('forms');
  const ts = useTranslations('statuses');
  const common = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const num = (key: string) => (formData.get(key) ? Number(formData.get(key)) : null);
      const str = (key: string) => (formData.get(key) ? String(formData.get(key)) : null);

      const response = await fetch('/api/v1/admin/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(formData.get('name') ?? ''),
          clubName: str('clubName'), country: str('country'), league: str('league'), position: str('position'),
          ageMin: num('ageMin'), ageMax: num('ageMax'),
          preferredFoot: str('preferredFoot'),
          salaryMin: num('salaryMin'), salaryMax: num('salaryMax'), salaryCurrency: str('salaryCurrency'),
          transferType: str('transferType'),
          contractLengthMonths: num('contractLengthMonths'),
          deadline: str('deadline'),
          description: str('description'), internalNotes: str('internalNotes'),
          visibility: String(formData.get('visibility') ?? 'PRIVATE'),
          status: String(formData.get('status') ?? 'OPEN'),
        }),
      });
      if (!response.ok) {
        setError(common('errorGeneric'));
        return;
      }
      const created = await response.json();
      router.push(`/admin/opportunities/${created.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald';
  // 'notDisclosed' lives in the opportunities namespace; footLeft/Right/Both
  // in forms — mixed on purpose (this reuses the labels the registration
  // form already ships) rather than duplicating three more translations.
  const footLabel: Record<(typeof FOOT_VALUES)[number], string> = {
    '': t('notDisclosed'), LEFT: f('footLeft'), RIGHT: f('footRight'), BOTH: f('footBoth'),
  };

  return (
    <form action={submit} className="grid gap-3 text-sm">
      <input name="name" required placeholder={t('name')} className={inputClass} />
      <div className="grid grid-cols-2 gap-3">
        <input name="clubName" placeholder={f('clubName')} className={inputClass} />
        <input name="country" placeholder={f('country')} className={inputClass} />
        <input name="league" placeholder={f('league')} className={inputClass} />
        <input name="position" placeholder={t('position')} className={inputClass} />
        <input name="ageMin" type="number" min={14} max={50} placeholder={`${t('ageRange')} min`} className={inputClass} />
        <input name="ageMax" type="number" min={14} max={50} placeholder={`${t('ageRange')} max`} className={inputClass} />
        <select name="preferredFoot" defaultValue="" className={inputClass}>
          {FOOT_VALUES.map((v) => <option key={v} value={v}>{footLabel[v]}</option>)}
        </select>
        <select name="transferType" defaultValue="" className={inputClass}>
          {TRANSFER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.labelKey as never)}</option>)}
        </select>
        <input name="salaryMin" type="number" min={0} placeholder={`${t('salary')} min`} className={inputClass} />
        <input name="salaryMax" type="number" min={0} placeholder={`${t('salary')} max`} className={inputClass} />
        <input name="salaryCurrency" placeholder="EUR" maxLength={10} className={inputClass} />
        <input name="contractLengthMonths" type="number" min={1} max={120} placeholder={t('contractLength')} className={inputClass} />
        <input name="deadline" type="date" className={inputClass} />
      </div>
      <textarea name="description" rows={3} placeholder={t('description')} className={inputClass} />
      <textarea name="internalNotes" rows={2} placeholder={t('internalNotes')} className={inputClass} />
      <div className="grid grid-cols-2 gap-3">
        <label className="grid gap-1">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{t('visibility')}</span>
          <select name="visibility" defaultValue="PRIVATE" className={inputClass}>
            {VISIBILITY_OPTIONS.map((v) => <option key={v} value={v}>{t(`vis${v}` as never)}</option>)}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-ink-faint">{t('status')}</span>
          <select name="status" defaultValue="OPEN" className={inputClass}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{ts(`opp${s}` as never)}</option>)}
          </select>
        </label>
      </div>

      <button type="submit" disabled={busy}
              className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
        {t('createOpportunity')}
      </button>
      {error && <p className="text-xs text-state-bad">{error}</p>}
    </form>
  );
}
