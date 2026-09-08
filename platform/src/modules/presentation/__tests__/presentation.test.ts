import { describe, expect, it } from 'vitest';
import { renderPresentation, type PresentationData } from '../template';

const base: PresentationData = {
  name: 'A B',
  headline: 'CB · Club',
  locale: 'en',
  generatedOn: '2025-01-01',
  sections: [{ title: 'identity', rows: [['nationality', 'PL']] }],
  summary: null,
  regulatoryNote: 'Not a FIFA Football Agent.',
};

describe('presentation template', () => {
  it('escapes every interpolated value', () => {
    const html = renderPresentation({
      ...base,
      name: '<img src=x onerror=alert(1)>',
      sections: [{ title: '<b>t</b>', rows: [['<i>k</i>', '<script>v</script>']] }],
    });
    expect(html).not.toContain('<img src=x');
    expect(html).not.toContain('<script>v');
    expect(html).toContain('&lt;script&gt;v&lt;/script&gt;');
  });

  it('omits a section that has no populated rows', () => {
    const html = renderPresentation({ ...base, sections: [{ title: 'career', rows: [] }] });
    expect(html).not.toContain('career');
  });

  it('always carries the regulatory note', () => {
    expect(renderPresentation(base)).toContain('Not a FIFA Football Agent.');
  });

  it('declares the recipient locale on the document', () => {
    expect(renderPresentation({ ...base, locale: 'ru' })).toContain('<html lang="ru"');
  });
});
