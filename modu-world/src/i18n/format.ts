import type { Locale, LocalizedText } from "@/lib/types";

/** Replaces {name} placeholders. */
export function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

const FALLBACK: Record<Locale, Locale[]> = { ru: ["ru", "en"], en: ["en", "ru"], be: ["be", "ru", "en"], pl: ["pl", "en", "ru"] };

/** Picks a translation from DB content ({ru, en, ...}) with sensible fallbacks. */
export function tl(text: LocalizedText | null | undefined, locale: Locale): string {
  if (!text) return "";
  for (const l of FALLBACK[locale]) if (text[l]) return text[l] as string;
  return Object.values(text)[0] ?? "";
}

export function pick<T>(content: Partial<Record<Locale, T>> | null | undefined, locale: Locale): T | undefined {
  if (!content) return undefined;
  for (const l of FALLBACK[locale]) if (content[l]) return content[l];
  return undefined;
}

export function dateFmt(d: string | Date | null | undefined, locale: Locale, withTime = false) {
  if (!d) return "—";
  const tag = { ru: "ru-RU", en: "en-GB", be: "be-BY", pl: "pl-PL" }[locale];
  return new Intl.DateTimeFormat(tag, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(d));
}

export function numFmt(n: number | string, locale: Locale) {
  return new Intl.NumberFormat(locale === "en" ? "en-GB" : "ru-RU").format(Number(n));
}
