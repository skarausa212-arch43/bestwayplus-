"use client";

import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setLocaleAction } from "@/app/actions";
import type { Locale } from "@/lib/types";

export function LocaleSwitcher({
  current,
  locales,
  label,
}: {
  current: Locale;
  locales: { code: Locale; label: string; ready: boolean }[];
  label: string;
}) {
  const [pending, start] = useTransition();
  return (
    <label className="relative inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1.5 text-xs text-cream/80 hover:border-peach/50">
      <Globe className="size-3.5" aria-hidden />
      <span className="sr-only">{label}</span>
      <select
        value={current}
        disabled={pending}
        onChange={(e) => {
          const fd = new FormData();
          fd.set("locale", e.target.value);
          start(() => setLocaleAction(fd));
        }}
        className="cursor-pointer appearance-none bg-transparent pr-1 font-semibold focus:outline-none"
      >
        {locales.map((l) => (
          <option key={l.code} value={l.code} className="bg-ink">
            {l.label}
            {l.ready ? "" : " β"}
          </option>
        ))}
      </select>
    </label>
  );
}
