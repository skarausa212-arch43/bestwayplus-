'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

type Value = string | number | boolean | null;
type Draft = Record<string, Value>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface FieldSpec {
  name: string;
  labelKey: string;
  type?: 'text' | 'date' | 'number' | 'textarea' | 'select' | 'checkbox';
  options?: Array<{ value: string; labelKey: string }>;
  section: string;
}

/**
 * Autosaving profile form.
 *
 * Saves on blur rather than on every keystroke: a player filling this in on a
 * phone with poor signal should never lose a section, but neither should the
 * API take a request per character. Failed saves are retried once and then
 * surfaced — the draft stays in the field either way.
 */
export function ProfileForm({
  initial, fields, sections,
}: {
  initial: Draft;
  fields: FieldSpec[];
  sections: Array<{ id: string; titleKey: string }>;
}) {
  const t = useTranslations('portal');
  const tf = useTranslations('forms');
  const [draft, setDraft] = useState<Draft>(initial);
  const [state, setState] = useState<SaveState>('idle');
  const pending = useRef<Draft>({});
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;

    setState('saving');
    const send = () =>
      fetch('/api/v1/me/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });

    try {
      let response = await send();
      if (!response.ok && response.status >= 500) response = await send(); // one retry
      setState(response.ok ? 'saved' : 'error');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function change(name: string, value: Value) {
    setDraft((previous) => ({ ...previous, [name]: value }));
    pending.current[name] = value;
    if (timer.current) clearTimeout(timer.current);
    // A short debounce catches tab-through-several-fields without a request each.
    timer.current = setTimeout(() => void flush(), 900);
  }

  const label: Record<SaveState, string> = {
    idle: t('autosaveIdle'),
    saving: t('autosaveSaving'),
    saved: t('autosaveSaved'),
    error: t('autosaveError'),
  };

  return (
    <form onSubmit={(event) => event.preventDefault()} className="grid gap-8">
      <p
        aria-live="polite"
        className={`text-xs ${state === 'error' ? 'text-state-bad' : state === 'saved' ? 'text-emerald' : 'text-ink-faint'}`}
      >
        {label[state]}
      </p>

      {sections.map((section) => (
        <fieldset key={section.id} id={section.id} className="grid gap-4">
          <legend className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
            {t(section.titleKey)}
          </legend>

          <div className="grid gap-4 sm:grid-cols-2">
            {fields.filter((field) => field.section === section.id).map((field) => {
              const id = `f-${field.name}`;
              const value = draft[field.name];

              return (
                <label key={field.name} htmlFor={id}
                       className={`grid gap-2 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
                  <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
                    {tf(field.labelKey)}
                  </span>

                  {field.type === 'textarea' ? (
                    <textarea
                      id={id} name={field.name} rows={4}
                      defaultValue={(value as string) ?? ''}
                      onBlur={(event) => change(field.name, event.target.value)}
                      className="min-h-[96px] rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald"
                    />
                  ) : field.type === 'select' ? (
                    <select
                      id={id} name={field.name}
                      defaultValue={(value as string) ?? ''}
                      onChange={(event) => change(field.name, event.target.value || null)}
                      className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald"
                    >
                      <option value="">—</option>
                      {field.options?.map((option) => (
                        <option key={option.value} value={option.value}>{tf(option.labelKey)}</option>
                      ))}
                    </select>
                  ) : field.type === 'checkbox' ? (
                    <input
                      id={id} name={field.name} type="checkbox"
                      defaultChecked={Boolean(value)}
                      onChange={(event) => change(field.name, event.target.checked)}
                      className="h-5 w-5 rounded border-line-faint bg-bg-panel accent-emerald"
                    />
                  ) : (
                    <input
                      id={id} name={field.name} type={field.type ?? 'text'}
                      inputMode={field.type === 'number' ? 'numeric' : undefined}
                      defaultValue={(value as string) ?? ''}
                      onBlur={(event) =>
                        change(field.name, field.type === 'number'
                          ? (event.target.value === '' ? null : Number(event.target.value))
                          : event.target.value)
                      }
                      className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald"
                    />
                  )}
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
    </form>
  );
}
