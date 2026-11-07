import type { Metadata } from "next";
import { getDict } from "@/i18n";
import { listCharacters, ownedCharacterSlugs } from "@/server/catalog";
import { getSessionUser } from "@/lib/auth";
import { CharacterCard } from "@/components/character-card";
import { PageHero } from "@/components/page-hero";

export const metadata: Metadata = { title: "Collection" };

export default async function CollectionPage() {
  const [{ t, locale }, characters, user] = await Promise.all([getDict(), listCharacters(), getSessionUser()]);
  const owned = user ? await ownedCharacterSlugs(user.id) : {};
  return (
    <>
      <PageHero eyebrow={t.collection.eyebrow} title={t.collection.title} text={t.collection.text} />
      <section className="container-x grid gap-6 pb-10 sm:grid-cols-2 lg:grid-cols-3">
        {characters.map((c) => (
          <CharacterCard key={c.id} c={c} t={t} locale={locale} owned={owned[c.slug]} />
        ))}
      </section>
    </>
  );
}
