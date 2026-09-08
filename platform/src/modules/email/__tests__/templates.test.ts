import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TEMPLATES, renderEmail, type TemplateKey } from '../templates';

const LOCALES = ['en', 'pl', 'ru'] as const;

const catalog = (locale: string): Record<string, string> =>
  JSON.parse(readFileSync(join(process.cwd(), 'src', 'messages', locale, 'emails.json'), 'utf8'));

const keys = Object.keys(TEMPLATES) as TemplateKey[];

describe('email templates', () => {
  it('every template has its subject key in all three locales', () => {
    for (const locale of LOCALES) {
      const messages = catalog(locale);
      for (const key of keys) {
        expect(messages).toHaveProperty(TEMPLATES[key].subjectKey);
      }
    }
  });

  it('renders in every locale without leaving a placeholder behind', () => {
    for (const locale of LOCALES) {
      const messages = catalog(locale);
      for (const key of keys) {
        const rendered = renderEmail(key, locale, messages, {
          name: 'Anna', appUrl: 'https://bestwayfootball.pl',
        });
        expect(rendered.subject.length).toBeGreaterThan(0);
        // An unreplaced {token} means the caller and the catalog disagree.
        expect(rendered.subject).not.toMatch(/\{\w+\}/);
        expect(rendered.text).not.toMatch(/\{\w+\}/);
        expect(rendered.html).not.toMatch(/\{\w+\}/);
      }
    }
  });

  it('links into the recipient locale, not the default', () => {
    const rendered = renderEmail('documentRequested', 'ru', catalog('ru'), {
      name: 'Anna', appUrl: 'https://bestwayfootball.pl/',
    });
    expect(rendered.text).toContain('https://bestwayfootball.pl/ru/portal/requests');
    expect(rendered.text).not.toContain('/en/portal');
  });

  it('escapes recipient-supplied values into the HTML body', () => {
    const rendered = renderEmail('documentRequested', 'en', catalog('en'), {
      name: '<script>alert(1)</script>', appUrl: 'https://bestwayfootball.pl',
    });
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).toContain('&lt;script&gt;');
  });

  it('marks every template transactional — none carries an unsubscribe', () => {
    for (const key of keys) {
      expect(TEMPLATES[key].transactional).toBe(true);
    }
  });
});
