'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/routing';

const FEET = ['LEFT', 'RIGHT', 'BOTH'] as const;
const TRANSFER_TYPES = ['TRANSFER', 'LOAN', 'FREE_AGENT'] as const;

export function CreateRecruitmentForm() {
  const t = useTranslations('recruitment');
  const tf = useTranslations('forms');
  const to = useTranslations('opportunities');
  const common = useTranslations('common');
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const ageMin = formData.get('ageMin');
      const ageMax = formData.get('ageMax');
      const response = await fetch('/api/v1/recruitment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          position: formData.get('position') || undefined,
          ageMin: ageMin ? Number(ageMin) : undefined,
          ageMax: ageMax ? Number(ageMax) : undefined,
          preferredFoot: formData.get('preferredFoot') || undefined,
          nationalityRestrictions: formData.get('nationalityRestrictions') || undefined,
          salaryBudget: formData.get('salaryBudget') || undefined,
          transferType: formData.get('transferType') || undefined,
          deadline: formData.get('deadline') || undefined,
          additionalRequirements: formData.get('additionalRequirements') || undefined,
        }),
      });
      if (!response.ok) {
        setError(common('errorGeneric'));
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputClass = 'rounded-[10px] border border-line-faint bg-bg-panel px-3 py-2 text-xs text-ink outline-none focus:border-emerald';

  return (
    <form action={submit} className="grid gap-3 text-sm">
      <input name="position" placeholder={tf('primaryPosition')} className={inputClass} />
      <div className="grid grid-cols-2 gap-3">
        <input name="ageMin" type="number" min={14} max={60} placeholder={t('ageMin')} className={inputClass} />
        <input name="ageMax" type="number" min={14} max={60} placeholder={t('ageMax')} className={inputClass} />
      </div>
      <select name="preferredFoot" defaultValue="" className={inputClass}>
        <option value="">{tf('preferredFoot')}</option>
        {FEET.map((foot) => <option key={foot} value={foot}>{tf(`foot${foot}` as never)}</option>)}
      </select>
      <input name="nationalityRestrictions" placeholder={t('nationalityRestrictions')} className={inputClass} />
      <input name="salaryBudget" placeholder={t('salaryBudget')} className={inputClass} />
      <select name="transferType" defaultValue="" className={inputClass}>
        <option value="">{to('transferType')}</option>
        {TRANSFER_TYPES.map((type) => <option key={type} value={type}>{to(`type${type}` as never)}</option>)}
      </select>
      <input name="deadline" type="date" className={inputClass} />
      <textarea name="additionalRequirements" rows={3} placeholder={t('additionalRequirements')} className={inputClass} />
      <button type="submit" disabled={busy}
              className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
        {t('submit')}
      </button>
      {error && <p className="text-xs text-state-bad">{error}</p>}
    </form>
  );
}
