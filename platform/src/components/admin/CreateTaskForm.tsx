'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;

export function CreateTaskForm({ staff, selfId }: { staff: Array<{ id: string; email: string }>; selfId: string }) {
  const t = useTranslations('tasks');
  const ts = useTranslations('statuses');
  const common = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(formData: FormData) {
    setBusy(true);
    setError(null);
    try {
      const relatedTo = formData.get('relatedUserEmail');
      const response = await fetch('/api/v1/admin/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formData.get('title'),
          description: formData.get('description') || null,
          relatedUserEmail: relatedTo ? String(relatedTo) : null,
          assigneeUserId: formData.get('assigneeUserId') || null,
          dueDate: formData.get('dueDate') || null,
          priority: formData.get('priority'),
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
      <input name="title" required placeholder={t('taskTitle')} className={inputClass} />
      <textarea name="description" rows={2} placeholder={t('taskDescription')} className={inputClass} />
      <input name="relatedUserEmail" type="email" placeholder={t('relatedTo')} className={inputClass} />
      <select name="assigneeUserId" defaultValue={selfId} className={inputClass}>
        {staff.map((member) => <option key={member.id} value={member.id}>{member.email}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-3">
        <select name="priority" defaultValue="NORMAL" className={inputClass}>
          {PRIORITIES.map((p) => <option key={p} value={p}>{ts(`prio${p}` as never)}</option>)}
        </select>
        <input name="dueDate" type="date" className={inputClass} />
      </div>
      <button type="submit" disabled={busy}
              className="rounded-[10px] bg-emerald-gradient px-4 py-2.5 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#04150C] disabled:opacity-60">
        {t('createTask')}
      </button>
      {error && <p className="text-xs text-state-bad">{error}</p>}
    </form>
  );
}
