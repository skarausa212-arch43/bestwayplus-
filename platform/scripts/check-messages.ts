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

/**
 * Second pass: every Prisma enum value that the UI renders as a label must
 * have a key. Adding a value to an enum and forgetting the label is silent
 * until a user sees a blank status pill, so it is checked here.
 */
const ENUM_LABELS: Array<{ enumName: string; namespace: string; prefix: string }> = [
  { enumName: 'DocumentStatus', namespace: 'statuses', prefix: 'doc' },
  { enumName: 'Stage', namespace: 'statuses', prefix: 'stage' },
  { enumName: 'VerificationStatus', namespace: 'statuses', prefix: 'ver' },
  { enumName: 'DocumentType', namespace: 'documents', prefix: 'type' },
  { enumName: 'TransferType', namespace: 'opportunities', prefix: 'type' },
];

const schema = readFileSync(join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8');

function enumValues(name: string): string[] {
  const match = new RegExp(`enum ${name} \\{([^}]*)\\}`).exec(schema);
  if (!match) return [];
  return match[1]!.split('\n').map((line) => line.trim()).filter(Boolean);
}

for (const { enumName, namespace, prefix } of ENUM_LABELS) {
  const values = enumValues(enumName);
  if (values.length === 0) {
    problems.push(`enum ${enumName} not found in prisma/schema.prisma`);
    continue;
  }
  for (const locale of locales) {
    const keys = new Set(flatten(read(locale, namespace)));
    for (const value of values) {
      const key = `${prefix}${value}`;
      if (!keys.has(key)) problems.push(`${locale}/${namespace}: missing enum label "${key}" (${enumName})`);
    }
  }
}

if (problems.length > 0) {
  console.error(`Message catalogs are inconsistent (${problems.length}):`);
  for (const problem of problems) console.error(`  · ${problem}`);
  process.exit(1);
}

console.log(
  `Catalogs consistent — ${locales.length} locales, ${namespaces.length} namespaces, ` +
  `${ENUM_LABELS.length} enum label sets.`,
);
