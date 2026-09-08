import type { AppLocale } from '@/i18n/routing';

/**
 * Print template for the player presentation.
 *
 * Rendered to PDF by headless Chromium in the worker rather than assembled
 * with a PDF library: the deck must match the brand, and maintaining two
 * renderers for one design is how they drift.
 */
export interface PresentationData {
  name: string;
  headline: string;
  locale: AppLocale;
  generatedOn: string;
  sections: Array<{ title: string; rows: Array<[string, string]> }>;
  summary?: string | null;
  regulatoryNote: string;
}

const escape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
       .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function renderPresentation(data: PresentationData): string {
  const sections = data.sections
    .filter((section) => section.rows.length > 0)
    .map(
      (section) => `<section class="block">
  <h2>${escape(section.title)}</h2>
  <dl>${section.rows
    .map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`)
    .join('')}</dl>
</section>`,
    )
    .join('');

  return `<!doctype html><html lang="${data.locale}"><head><meta charset="utf-8">
<title>${escape(data.name)}</title>
<style>
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { margin:0; font-family: "Manrope", system-ui, sans-serif; color:#0E1A13; background:#fff;
         font-size:10.5pt; line-height:1.55; }
  header { display:flex; justify-content:space-between; align-items:flex-start;
           border-bottom:2px solid #19C76B; padding-bottom:10mm; margin-bottom:9mm; }
  h1 { margin:0; font-size:26pt; font-weight:800; letter-spacing:-.02em; line-height:1.05; }
  .headline { margin-top:2mm; color:#4A6357; font-size:11pt; }
  .brand { text-align:right; font-size:8pt; letter-spacing:.22em; text-transform:uppercase; color:#0C7B45; }
  .block { break-inside:avoid; margin-bottom:8mm; }
  h2 { margin:0 0 4mm; font-size:8.5pt; letter-spacing:.22em; text-transform:uppercase; color:#0C7B45; }
  dl { display:grid; grid-template-columns:repeat(3, 1fr); gap:4mm 6mm; margin:0; }
  dt { font-size:7.5pt; letter-spacing:.14em; text-transform:uppercase; color:#7A8F82; }
  dd { margin:1mm 0 0; font-size:10.5pt; }
  .summary { white-space:pre-line; color:#324A3C; }
  footer { position:fixed; bottom:0; left:0; right:0; font-size:7pt; line-height:1.5; color:#7A8F82;
           border-top:1px solid #D8E4DC; padding-top:3mm; }
</style></head><body>
<header>
  <div><h1>${escape(data.name)}</h1><p class="headline">${escape(data.headline)}</p></div>
  <div class="brand">Bestway Football<br>${escape(data.generatedOn)}</div>
</header>
${sections}
${data.summary ? `<section class="block"><h2>Summary</h2><p class="summary">${escape(data.summary)}</p></section>` : ''}
<footer>${escape(data.regulatoryNote)}</footer>
</body></html>`;
}
