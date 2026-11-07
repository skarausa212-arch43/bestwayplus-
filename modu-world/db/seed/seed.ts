/**
 * Seed data.
 *  - seedCatalog(): real catalogue content (characters). Safe for production.
 *  - seedDemo():    DEMO data — users, concept partner, rewards, a demo NFC batch. Everything is
 *                   flagged is_demo = true and uses the reserved .demo e-mail domain.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import type { Client } from "pg";
import { hashPassword, humanCode, randomToken } from "../../src/lib/crypto";
import { activationCodeHash } from "../../src/server/toys";
import { characters } from "./catalog";

export const DEMO_PASSWORD = "ModuDemo2026!";
export const DEMO_USERS = {
  admin: "admin@modu.demo",
  parent: "parent@modu.demo",
  collector: "collector@modu.demo",
  partner: "partner@modu.demo",
} as const;

async function as<T>(c: Client, userId: string | null, fn: () => Promise<T>): Promise<T> {
  await c.query("select set_config('app.user_id', $1, false)", [userId ?? ""]);
  try {
    return await fn();
  } finally {
    await c.query("select set_config('app.user_id', '', false)");
  }
}

async function fn<T = Record<string, unknown>>(c: Client, name: string, args: unknown[]): Promise<T> {
  const ph = args.map((_, i) => `$${i + 1}`).join(", ");
  const { rows } = await c.query(`select app.${name}(${ph}) as r`, args);
  const r = rows[0].r;
  if (!r.ok) throw new Error(`${name} failed: ${r.error}`);
  return r as T;
}

export async function seedCatalog(c: Client) {
  for (const ch of characters) {
    await c.query(
      `insert into characters (slug, name, serial_prefix, series, min_age, rarity, content, accessories, image_path, accent_color, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (slug) do update set name = excluded.name, series = excluded.series, min_age = excluded.min_age,
         rarity = excluded.rarity, content = excluded.content, accessories = excluded.accessories,
         image_path = excluded.image_path, accent_color = excluded.accent_color, sort_order = excluded.sort_order`,
      [
        ch.slug,
        ch.name,
        ch.serial_prefix,
        ch.series,
        ch.min_age,
        ch.rarity,
        JSON.stringify(ch.content),
        JSON.stringify(ch.accessories),
        ch.image_path,
        ch.accent_color,
        ch.sort_order,
      ],
    );
  }
}

export async function seedRewards(c: Client) {
  const { rows } = await c.query(
    `insert into partners (slug, name, website, is_concept, is_demo, description, disclaimer)
     values ('mak-by', 'Mak.by', 'https://mak.by', true, true, $1, $2)
     on conflict (slug) do update set is_concept = true returning id`,
    [
      JSON.stringify({
        ru: "Демонстрационный пример партнёрской кампании для семей.",
        en: "Demo example of a family partner campaign.",
      }),
      JSON.stringify({
        ru: "Концепт, партнёрство не подтверждено",
        en: "Concept — partnership not confirmed",
      }),
    ],
  );
  const makby = rows[0].id;
  const rewards = [
    ["sticker-pack", null, "merch", 150, null, null, { ru: "Набор стикеров MODU", en: "MODU sticker pack" },
      { ru: "10 виниловых стикеров с персонажами Genesis.", en: "10 vinyl stickers with Genesis characters." }],
    ["digital-look-autumn", null, "digital", 200, null, 1, { ru: "Цифровой образ «Осень»", en: "Digital look “Autumn”" },
      { ru: "Новый наряд для персонажа в профиле MODU.", en: "A new outfit for your character in the MODU profile." }],
    ["school-keychain", null, "merch", 300, 200, 2, { ru: "Брелок MODU School", en: "MODU School keychain" },
      { ru: "Светоотражающий брелок для рюкзака.", en: "Reflective backpack keychain." }],
    ["rabbit-headphones", null, "toys", 400, 50, 1, { ru: "Аксессуар: наушники Gold", en: "Accessory: Gold headphones" },
      { ru: "Сменный аксессуар для MODU RABBIT.", en: "Swappable accessory for MODU RABBIT." }],
    ["makby-family-20", makby, "partner", 500, 100, 1, { ru: "Скидка 20% на семейный обед", en: "20% off a family meal" },
      { ru: "Пример партнёрской награды (демо).", en: "Example partner reward (demo)." }],
    ["new-figure", null, "toys", 2500, 5, 1, { ru: "Новая фигурка MODU", en: "New MODU figure" },
      { ru: "Любой персонаж серии Genesis на выбор.", en: "Any Genesis character of your choice." }],
  ] as const;
  for (const [slug, partner, category, cost, stock, limit, title, description] of rewards) {
    await c.query(
      `insert into reward_catalog (slug, partner_id, category, cost_points, stock, per_user_limit, title, description, is_demo)
       values ($1,$2,$3,$4,$5,$6,$7,$8, true) on conflict (slug) do nothing`,
      [slug, partner, category, cost, stock, limit, JSON.stringify(title), JSON.stringify(description)],
    );
  }
  return { makby };
}

async function demoUser(c: Client, email: string, name: string, roles: string[], partnerId: string | null = null) {
  const hash = await hashPassword(DEMO_PASSWORD);
  const r = await fn<{ user_id: string }>(c, "register_user", [email, hash, name, null, "ru"]);
  await c.query("update users set roles = $2::app_role[], partner_id = $3, is_demo = true where id = $1", [
    r.user_id,
    `{${roles.join(",")}}`,
    partnerId,
  ]);
  return r.user_id;
}

export async function seedDemo(c: Client, appUrl: string) {
  const exists = await c.query("select 1 from users where email = $1", [DEMO_USERS.admin]);
  if (exists.rowCount) {
    console.log("• demo data already present — skipped (use npm run db:reset for a clean demo)");
    return null;
  }
  const { makby } = await seedRewards(c);
  const admin = await demoUser(c, DEMO_USERS.admin, "MODU Admin", ["parent", "admin"]);
  const parent = await demoUser(c, DEMO_USERS.parent, "Ольга (демо)", ["parent"]);
  const collector = await demoUser(c, DEMO_USERS.collector, "Алексей (демо)", ["parent"]);
  await demoUser(c, DEMO_USERS.partner, "Mak.by кассир (демо)", ["partner"], makby);

  await as(c, parent, () => fn(c, "create_child", ["Аня", new Date().getFullYear() - 10, "parents-v1"]));
  await as(c, collector, () => fn(c, "attest_adult", ["1990-05-14"]));

  // Demo NFC batch: 3 bears for the live demo + 1 collector dragon already activated by the collector.
  const chars = Object.fromEntries((await c.query("select slug, id from characters")).rows.map((r) => [r.slug, r.id]));
  const issued: { serial: string; url: string; code: string; note: string }[] = [];
  async function batch(slug: string, code: string, n: number, edition: string) {
    const tokens = Array.from({ length: n }, () => randomToken(16));
    const codes = Array.from({ length: n }, () => humanCode(2, 4));
    await as(c, admin, () =>
      fn(c, "create_batch", [chars[slug], code, edition, "ntag215", tokens, codes.map(activationCodeHash), true, "DEMO"]),
    );
    const { rows } = await c.query(
      `select t.serial_number, n.public_token from toy_instances t join nfc_tags n on n.toy_instance_id = t.id
       join toy_batches b on b.id = t.batch_id where b.code = $1 order by t.edition_number`,
      [code],
    );
    return rows.map((r, i) => ({ serial: r.serial_number, token: r.public_token, code: codes[tokens.indexOf(r.public_token)] ?? codes[i] }));
  }
  const bears = await batch("modu-bear", "DEMO-BEAR", 3, "standard");
  bears.forEach((b) => issued.push({ serial: b.serial, url: `${appUrl}/t/${b.token}`, code: b.code, note: "free for live demo" }));
  const [dragon] = await batch("modu-dragon", "DEMO-DRAGON", 1, "collector");
  await as(c, collector, () => fn(c, "activate_toy", [dragon.token, activationCodeHash(dragon.code), null]));
  issued.push({ serial: dragon.serial, url: `${appUrl}/t/${dragon.token}`, code: "(used)", note: "owned by collector@modu.demo" });

  mkdirSync(".data", { recursive: true });
  writeFileSync(
    ".data/demo-tags.csv",
    "serial,url,activation_code,note\n" + issued.map((i) => `${i.serial},${i.url},${i.code},${i.note}`).join("\n") + "\n",
  );
  return { issued };
}
