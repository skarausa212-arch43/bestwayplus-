import type { AppLocale } from '@/i18n/routing';

/**
 * Transactional email templates.
 *
 * Every template names the catalog keys it needs, so a missing translation is
 * a build-time failure in the test below rather than an English sentence
 * arriving in a Polish inbox.
 */
export const TEMPLATES = {
  verifyEmail: {
    subjectKey: 'subjectVerify',
    /** Marketing consent does not gate these — they are not marketing. */
    transactional: true,
    action: 'openPortal',
    path: '/portal',
  },
  passwordReset: {
    subjectKey: 'subjectReset',
    transactional: true,
    action: 'openPortal',
    path: '/portal/settings/security',
  },
  documentRequested: {
    subjectKey: 'subjectDocRequest',
    transactional: true,
    action: 'openPortal',
    path: '/portal/requests',
  },
  documentApproved: {
    subjectKey: 'subjectDocApproved',
    transactional: true,
    action: 'openPortal',
    path: '/portal/documents',
  },
  opportunityAssigned: {
    subjectKey: 'subjectOpportunity',
    transactional: true,
    action: 'openPortal',
    path: '/portal/opportunities',
  },
} as const;

export type TemplateKey = keyof typeof TEMPLATES;

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

type Catalog = Record<string, string>;

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/**
 * Renders one email. The locale is the recipient's, taken from users.locale —
 * never the language of the staff member who triggered the event.
 */
export function renderEmail(
  key: TemplateKey,
  locale: AppLocale,
  catalog: Catalog,
  vars: { name?: string; appUrl: string } & Record<string, string | number>,
): RenderedEmail {
  const template = TEMPLATES[key];
  const subject = interpolate(catalog[template.subjectKey] ?? key, vars);
  const greeting = interpolate(catalog.greeting ?? '', { ...vars, name: vars.name ?? '' });
  const cta = catalog[template.action] ?? '';
  const footer = catalog.footerTransactional ?? '';
  const url = `${vars.appUrl.replace(/\/$/, '')}/${locale}${template.path}`;

  const text = [greeting, subject, '', `${cta}: ${url}`, '', footer]
    .filter(Boolean).join('\n');

  const html = `<!doctype html><html lang="${locale}"><body style="margin:0;background:#031A10;padding:32px 16px;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#F5F7F6">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="100%" style="max-width:560px;background:#061F15;border:1px solid rgba(56,232,135,.16);border-radius:14px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px">
<p style="margin:0;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:#38E887">Bestway Football</p>
</td></tr>
<tr><td style="padding:12px 28px 0">
<p style="margin:0 0 12px;font-size:15px;color:#91A59A">${escapeHtml(greeting)}</p>
<p style="margin:0;font-size:19px;font-weight:700;line-height:1.35">${escapeHtml(subject)}</p>
</td></tr>
<tr><td style="padding:24px 28px 28px">
<a href="${escapeHtml(url)}" style="display:inline-block;background:#19C76B;color:#04150C;text-decoration:none;padding:12px 22px;border-radius:10px;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">${escapeHtml(cta)}</a>
</td></tr>
<tr><td style="padding:0 28px 28px">
<p style="margin:0;font-size:12px;line-height:1.6;color:#647A6D">${escapeHtml(footer)}</p>
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject, text, html };
}
