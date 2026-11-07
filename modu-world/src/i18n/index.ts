import "server-only";
import { cookies, headers } from "next/headers";
import ru, { type Dict } from "./ru";
import en from "./en";
import be from "./be";
import pl from "./pl";
import type { Locale, LocalizedText } from "@/lib/types";

export const LOCALES: { code: Locale; label: string; ready: boolean }[] = [
  { code: "ru", label: "RU", ready: true },
  { code: "en", label: "EN", ready: true },
  { code: "be", label: "BE", ready: false },
  { code: "pl", label: "PL", ready: false },
];
export const LOCALE_COOKIE = "modu_locale";

type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K] };

function merge<T>(base: T, over: DeepPartial<T>): T {
  if (Array.isArray(base) || typeof base !== "object" || base === null) return (over ?? base) as T;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, v] of Object.entries(over ?? {})) {
    out[k] = v === undefined ? out[k] : merge((base as Record<string, unknown>)[k], v as never);
  }
  return out as T;
}

// Belarusian falls back to Russian, Polish to English, key by key.
const dictionaries: Record<Locale, Dict> = {
  ru,
  en,
  be: merge(ru, be as DeepPartial<Dict>),
  pl: merge(en, pl as DeepPartial<Dict>),
};

export function isLocale(v: unknown): v is Locale {
  return v === "ru" || v === "en" || v === "be" || v === "pl";
}

export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  const accept = (await headers()).get("accept-language") ?? "";
  const first = accept.split(",")[0]?.slice(0, 2).toLowerCase();
  if (first === "en" || first === "pl" || first === "be") return first as Locale;
  return "ru";
}

export async function getDict(): Promise<{ t: Dict; locale: Locale }> {
  const locale = await getLocale();
  return { t: dictionaries[locale], locale };
}

export function dictFor(locale: Locale): Dict {
  return dictionaries[locale];
}

export { fmt, tl } from "./format";
export type { Dict };
export type { LocalizedText };
