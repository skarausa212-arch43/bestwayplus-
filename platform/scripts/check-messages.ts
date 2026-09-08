/**
 * CI guard for the catalogs.
 *
 * Fails the build when a locale is missing a key, carries one the default
 * locale does not have, or leaves a value empty. A missing translation should
 * be a red pipeline, not a key name rendered to a Polish user.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src', 'messages');
const DEFAULT_LOCALE = 'en';

type Catalog = Record<string, unknown>;

function flatten(input: Catalog, prefix = ''): string[] {
  return Object.entries(input).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === 'object'
      ? flatten(value as Catalog, path)
      : [path];
  });
}

function read(locale: string, namespace: string): Catalog {
  return JSON.parse(readFileSync(join(ROOT, locale, `${namespace}.json`), 'utf8')) as Catalog;
}

const locales = readdirSync(ROOT).filter((entry) => !entry.startsWith('.'));
const namespaces = readdirSync(join(ROOT, DEFAULT_LOCALE))
  .filter((file) => file.endsWith('.json'))
  .map((file) => file.replace(/\.json$/, ''));

const problems: string[] = [];

for (const namespace of namespaces) {
  const reference = flatten(read(DEFAULT_LOCALE, namespace)).sort();

  for (const locale of locales) {
    if (locale === DEFAULT_LOCALE) continue;

    let catalog: Catalog;
    try {
      catalog = read(locale, namespace);
    } catch {
      problems.push(`${locale}/${namespace}.json is missing entirely`);
      continue;
    }

    const keys = flatten(catalog).sort();
    for (const key of reference) {
      if (!keys.includes(key)) problems.push(`${locale}/${namespace}: missing "${key}"`);
    }
    for (const key of keys) {
      if (!reference.includes(key)) problems.push(`${locale}/${namespace}: unexpected "${key}"`);
    }
    for (const [key, value] of Object.entries(catalog)) {
      if (typeof value === 'string' && value.trim() === '') {
        problems.push(`${locale}/${namespace}: "${key}" is empty`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Message catalogs are inconsistent (${problems.length}):`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log(`Catalogs consistent — ${locales.length} locales, ${namespaces.length} namespaces.`);
