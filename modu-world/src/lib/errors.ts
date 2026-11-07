import type { Dict } from "@/i18n/ru";

export function errMsg(t: Dict, code: string | undefined): string {
  if (!code) return t.common.error;
  return (t.errors as Record<string, string>)[code] ?? t.common.error;
}
