'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from '@/i18n/routing';
import {
  ROLE_SECTIONS, ACCOUNT_FIELDS, LIST_FIELDS, SLUG_TO_ROLE, type RoleSlug, type RegField,
} from '@/modules/auth/registration-fields';

type Errors = Record<string, string>;

/**
 * Renders account fields, the role's own sections, then the two required
 * consents and the two optional ones — kept as four separate checkboxes
 * rather than one "I agree" box, because required and marketing consent must
 * never be collectable as a single tick.
 */
export function JoinForm({ role }: { role: RoleSlug }) {
  const t = useTranslations('join');
  const tf = useTranslations('forms');
  const tc = useTranslations('consent');
  const tv = useTranslations('validation');
  const common = useTranslations('common');
  const locale = useLocale();
  const router = useRouter();

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const sections = ROLE_SECTIONS[role];

  function renderField(field: RegField) {
    const id = `f-${field.name}`;
    const error = errors[field.name];
    const label = tf(field.labelKey as never);

    return (
      <label key={field.name} htmlFor={id}
             className={`grid gap-2 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
        <span className="font-display text-[9.5px] font-semibold uppercase tracking-[0.24em] text-ink-faint">
          {label}{field.required ? '' : ` (${common('optional')})`}
        </span>

        {field.type === 'textarea' ? (
          <textarea id={id} name={field.name} rows={4}
            className="min-h-[96px] rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald" />
        ) : field.type === 'select' ? (
          <select id={id} name={field.name} defaultValue=""
            className="rounded-[10px] border border-line-faint bg-bg-panel px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald">
            <option value="" disabled>—</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>{tf(option.labelKey as never)}</option>
            ))}
          </select>
        ) : field.type === 'checkbox' ? (
          <input id={id} name={field.name} type="checkbox"
            className="h-5 w-5 justify-self-start rounded border-line-faint bg-bg-panel accent-emerald" />
        ) : field.type === 'list' ? (
          <input id={id} name={field.name} type="text" placeholder="a, b, c"
            className="rounded-[10px] border border-line-faint bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald" />
        ) : (
          <input id={id} name={field.name}
            type={field.type === 'password' ? 'password' : field.type === 'email' ? 'email' : field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'}
            required={field.required}
            className={`rounded-[10px] border bg-bg-panel/60 px-3.5 py-3 text-[15px] text-ink outline-none focus:border-emerald ${error ? 'border-state-bad' : 'border-line-faint'}`}
          />
        )}
        {field.name === 'password' && <span className="text-xs text-ink-faint">{tf('passwordHint')}</span>}
        {error && <span className="text-xs text-state-bad">{tv(error as never)}</span>}
      </label>
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setErrors({});

    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { role: SLUG_TO_ROLE[role], locale };

    for (const field of [...ACCOUNT_FIELDS, ...sections.flatMap((s) => s.fields)]) {
      if (field.type === 'checkbox') {
        body[field.name] = form.get(field.name) === 'on';
        continue;
      }
      const raw = (form.get(field.name) as string | null) ?? '';
      if (LIST_FIELDS.has(field.name)) {
        body[field.name] = raw.split(',').map((v) => v.trim()).filter(Boolean);
        continue;
      }
      if (field.type === 'number') {
        body[field.name] = raw === '' ? undefined : Number(raw);
        continue;
      }
      body[field.name] = raw;
    }

    body.consents = {
      terms: form.get('consent-terms') === 'on',
      privacy: form.get('consent-privacy') === 'on',
      profileSharing: form.get('consent-sharing') === 'on',
      marketing: form.get('consent-marketing') === 'on',
    };

    try {
      const response = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();

      if (response.ok && result.ok) {
        router.push('/portal');
        router.refresh();
        return;
      }
      if (result.fieldErrors) {
        // Consent checkboxes and nested paths (e.g. "consents.terms") don't
        // map to a rendered input by name — surface those as the form-level
        // error instead of a label nobody can see.
        const flat: Errors = {};
        for (const [key, message] of Object.entries<string>(result.fieldErrors)) {
          flat[key.replace(/^consents\./, 'consent-')] = message;
        }
        setErrors(flat);
      }
      setFormError(t('formError'));
    } catch {
      setFormError(common('errorGeneric'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid gap-8">
      <fieldset className="grid gap-4">
        <legend className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
          {tf('sectionAccount')}
        </legend>
        <div className="grid gap-4 sm:grid-cols-2">{ACCOUNT_FIELDS.map(renderField)}</div>
      </fieldset>

      {sections.map((section) => (
        <fieldset key={section.id} className="grid gap-4">
          <legend className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
            {tf(section.titleKey as never)}
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">{section.fields.map(renderField)}</div>
        </fieldset>
      ))}

      <fieldset className="grid gap-3">
        <legend className="font-display text-[10px] font-bold uppercase tracking-[0.24em] text-emerald">
          {tf('sectionConsents')}
        </legend>

        <label className="flex items-start gap-3 text-sm text-ink-muted">
          <input type="checkbox" name="consent-terms" required
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-faint bg-bg-panel accent-emerald" />
          {tc('termsLabel')}
        </label>
        {errors['consent-terms'] && <span className="text-xs text-state-bad">{tv(errors['consent-terms'] as never)}</span>}

        <label className="flex items-start gap-3 text-sm text-ink-muted">
          <input type="checkbox" name="consent-privacy" required
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-faint bg-bg-panel accent-emerald" />
          {tc('privacyLabel')}
        </label>
        {errors['consent-privacy'] && <span className="text-xs text-state-bad">{tv(errors['consent-privacy'] as never)}</span>}

        {/* Optional and separate from the two above — ticking neither still
            lets the form submit; only terms and privacy are required. */}
        <label className="flex items-start gap-3 text-sm text-ink-muted">
          <input type="checkbox" name="consent-sharing"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-faint bg-bg-panel accent-emerald" />
          <span>{tc('sharingLabel')} <span className="text-ink-faint">({common('optional')})</span></span>
        </label>
        <label className="flex items-start gap-3 text-sm text-ink-muted">
          <input type="checkbox" name="consent-marketing"
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-line-faint bg-bg-panel accent-emerald" />
          <span>{tc('marketingLabel')} <span className="text-ink-faint">({common('optional')})</span></span>
        </label>
      </fieldset>

      {formError && (
        <p role="alert" className="rounded-[10px] border border-state-bad/40 bg-state-bad/10 px-4 py-3 text-sm text-state-bad">
          {formError}
        </p>
      )}

      <button type="submit" disabled={submitting}
        className="justify-self-start rounded-[10px] bg-emerald-gradient px-6 py-3.5 font-display text-[11px] font-bold uppercase tracking-[0.18em] text-[#04150C] disabled:opacity-60">
        {submitting ? t('submitting') : t('submit')}
      </button>
    </form>
  );
}
