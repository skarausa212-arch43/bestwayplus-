import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import type { Character, Locale } from "@/lib/types";
import { pick, fmt } from "@/i18n/format";
import type { Dict } from "@/i18n/ru";

export const rarityTone = { common: "peach", rare: "gold", epic: "silver", legendary: "gold" } as const;

export function CharacterCard({ c, t, locale, owned }: { c: Character; t: Dict; locale: Locale; owned?: number }) {
  const content = pick(c.content, locale);
  return (
    <Link
      href={`/collection/${c.slug}`}
      className="group card relative flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:border-peach/40"
    >
      <div className="relative aspect-[4/5] overflow-hidden">
        <div
          className="absolute inset-0 opacity-60 transition group-hover:opacity-90"
          style={{ background: `radial-gradient(circle at 50% 70%, ${c.accent_color}55, transparent 65%)` }}
        />
        <Image
          src={c.image_path}
          alt={c.name}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover object-top transition duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-x-0 bottom-0 h-1/4 bg-gradient-to-t from-ink-2 to-transparent" />
        <div className="absolute left-4 top-4 z-10 flex gap-2">
          <Badge tone={rarityTone[c.rarity]}>{t.collection.rarity[c.rarity]}</Badge>
          <Badge>{fmt(t.collection.ageFrom, { age: c.min_age })}</Badge>
        </div>
        {owned ? (
          <div className="absolute right-4 top-4 z-10">
            <Badge tone="success">{fmt(t.collection.owned, { n: owned })}</Badge>
          </div>
        ) : null}
      </div>
      <div className="flex items-end justify-between gap-3 border-t border-line p-5">
        <div>
          <h3 className="font-display text-xl font-bold">{c.name}</h3>
          <p className="mt-1 text-sm text-cream/65">{content?.tagline}</p>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-line text-cream/70 transition group-hover:border-peach group-hover:bg-peach group-hover:text-ink">
          <ArrowUpRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}
