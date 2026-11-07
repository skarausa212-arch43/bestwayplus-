import "server-only";
import { cache } from "react";
import { withUser } from "@/lib/db";
import type { Character } from "@/lib/types";

export const listCharacters = cache(async (): Promise<Character[]> => {
  return withUser(null, async (db) => {
    const { rows } = await db.query("select * from characters where is_active order by sort_order");
    return rows;
  });
});

export const getCharacter = cache(async (slug: string): Promise<Character | null> => {
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) return null;
  return withUser(null, async (db) => {
    const { rows } = await db.query("select * from characters where slug = $1 and is_active", [slug]);
    return rows[0] ?? null;
  });
});

/** Which characters the user (or their children) own — drives collection progress. */
export async function ownedCharacterSlugs(userId: string): Promise<Record<string, number>> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select c.slug, count(*)::int as n from toy_instances t join characters c on c.id = t.character_id
        where t.owner_user_id = app.uid() group by c.slug`,
    );
    return Object.fromEntries(rows.map((r) => [r.slug, r.n]));
  });
}
