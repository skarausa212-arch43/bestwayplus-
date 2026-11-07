import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Box, Sparkles, Nfc, Check } from "lucide-react";
import { getDict } from "@/i18n";
import { fmt, pick, tl } from "@/i18n/format";
import { getCharacter, listCharacters, ownedCharacterSlugs } from "@/server/catalog";
import { getSessionUser } from "@/lib/auth";
import { Badge } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { rarityTone } from "@/components/character-card";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const c = await getCharacter((await params).slug);
  return { title: c?.name ?? "Character" };
}

export default async function CharacterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [{ t, locale }, c, all, user] = await Promise.all([getDict(), getCharacter(slug), listCharacters(), getSessionUser()]);
  if (!c) notFound();
  const content = pick(c.content, locale);
  const owned = user ? (await ownedCharacterSlugs(user.id))[c.slug] : 0;
  const others = all.filter((x) => x.slug !== c.slug);

  return (
    <div className="container-x pb-10 pt-8">
      <Link href="/collection" className="inline-flex items-center gap-2 text-sm text-cream/60 hover:text-peach">
        <ArrowLeft className="size-4" /> {t.collection.allCharacters}
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-2">
        <div className="card relative aspect-square overflow-hidden lg:aspect-auto lg:min-h-[560px]">
          <div className="absolute inset-0" style={{ background: `radial-gradient(circle at 50% 75%, ${c.accent_color}66, transparent 60%)` }} />
          <Image src={c.image_path} alt={c.name} fill priority sizes="(max-width:1024px) 100vw, 50vw" className="object-contain object-bottom p-6 animate-float" />
        </div>
        <div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={rarityTone[c.rarity]}>{t.collection.rarity[c.rarity]}</Badge>
            <Badge>{fmt(t.collection.ageFrom, { age: c.min_age })}</Badge>
            <Badge>
              {t.collection.series}: {c.series}
            </Badge>
            {owned ? <Badge tone="success">{fmt(t.collection.owned, { n: owned })}</Badge> : null}
          </div>
          <h1 className="mt-5 text-5xl font-extrabold sm:text-6xl">{c.name}</h1>
          <p className="mt-3 text-xl text-peach">{content?.tagline}</p>

          <h2 className="mt-10 text-sm font-semibold uppercase tracking-widest text-muted">{t.collection.story}</h2>
          <p className="mt-3 leading-relaxed text-cream/80">{content?.story}</p>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-widest text-muted">{t.collection.traits}</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {content?.traits.map((tr) => (
              <li key={tr} className="flex items-center gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
                <Check className="size-4 text-peach" /> {tr}
              </li>
            ))}
          </ul>

          <h2 className="mt-8 text-sm font-semibold uppercase tracking-widest text-muted">{t.collection.accessories}</h2>
          <ul className="mt-3 grid gap-2">
            {c.accessories.map((a) => (
              <li key={a.slug} className="flex items-center justify-between rounded-2xl border border-line bg-ink-2/60 px-4 py-3">
                <span className="flex items-center gap-3 text-sm">
                  {a.kind === "digital" ? <Sparkles className="size-4 text-gold" /> : <Box className="size-4 text-silver" />}
                  {tl(a.name, locale)}
                </span>
                <Badge tone={a.kind === "digital" ? "gold" : "silver"}>
                  {a.kind === "digital" ? t.collection.digital : t.collection.physical}
                </Badge>
              </li>
            ))}
          </ul>
          <Button asChild size="lg" className="mt-8 w-full sm:w-auto">
            <Link href="/activate">
              <Nfc /> {t.collection.activateCta}
            </Link>
          </Button>
        </div>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {others.map((o) => (
          <Link key={o.slug} href={`/collection/${o.slug}`} className="card group flex items-center gap-4 p-4 hover:border-peach/40">
            <div className="relative size-20 shrink-0 overflow-hidden rounded-2xl bg-ink">
              <Image src={o.image_path} alt="" fill sizes="80px" className="object-contain" />
            </div>
            <div>
              <div className="font-display font-bold group-hover:text-peach">{o.name}</div>
              <div className="text-sm text-muted">{pick(o.content, locale)?.tagline}</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
