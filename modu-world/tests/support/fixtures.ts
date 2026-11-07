import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { registerUser } from "@/server/users";
import { createBatch } from "@/server/admin";
import { withUser, callFn } from "@/lib/db";
import type { Role } from "@/lib/types";

let n = 0;
const uniq = () => `${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function adminClient() {
  const c = new Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await c.connect();
  return c;
}

/** Creates a user through the real registration path, then sets roles with the owner connection. */
export async function makeUser(roles: Role[] = ["parent"], extra: { partnerId?: string } = {}) {
  const email = `u-${uniq()}@test.local`;
  const res = await registerUser({ email, password: "correct-horse-battery", displayName: "Test", acceptTerms: true });
  if (!res.ok) throw new Error(res.error);
  const c = await adminClient();
  await c.query("update users set roles = $2::app_role[], partner_id = $3 where id = $1", [
    res.user_id,
    `{${roles.join(",")}}`,
    extra.partnerId ?? null,
  ]);
  await c.end();
  return { id: res.user_id, email };
}

export async function makeChild(parentId: string) {
  const r = await callFn<{ child_id: string }>(parentId, "create_child", ["Kid", 2016, "parents-v1"]);
  if (!r.ok) throw new Error(r.error);
  return r.child_id;
}

export async function characterId(slug = "modu-bear") {
  return withUser(null, async (db) => (await db.query("select id from characters where slug = $1", [slug])).rows[0].id as string);
}

export async function makeBatch(adminId: string, quantity = 3, slug = "modu-bear") {
  const res = await createBatch(adminId, {
    characterId: await characterId(slug),
    quantity,
    code: `T${uniq().toUpperCase().slice(0, 10)}`,
    edition: "standard",
    tagType: "ntag215",
    isDemo: true,
  });
  if (!res.ok) throw new Error(res.error);
  return res.issued;
}

export async function accountOf(userId: string) {
  const c = await adminClient();
  const { rows } = await c.query("select id, balance from points_accounts where user_id = $1", [userId]);
  await c.end();
  return rows[0] as { id: string; balance: number };
}

export async function grantPoints(userId: string, amount: number) {
  const c = await adminClient();
  const { rows } = await c.query("select id from points_accounts where user_id = $1", [userId]);
  await c.query("select app.post_points($1, $2, 'admin_credit', 'test', null, $3, 'test')", [rows[0].id, amount, randomUUID()]);
  await c.end();
  return rows[0].id as string;
}

export async function makePartner(slug = `p-${uniq()}`.toLowerCase().slice(0, 30)) {
  const c = await adminClient();
  const { rows } = await c.query("insert into partners (slug, name) values ($1, $1) returning id", [slug]);
  await c.end();
  return rows[0].id as string;
}

export async function makeReward(opts: { cost: number; stock?: number | null; limit?: number | null; partnerId?: string | null }) {
  const c = await adminClient();
  const { rows } = await c.query(
    `insert into reward_catalog (slug, partner_id, title, cost_points, stock, per_user_limit)
     values ($1, $2, '{"en":"Test reward","ru":"Тест"}', $3, $4, $5) returning id`,
    [`r-${uniq()}`.toLowerCase(), opts.partnerId ?? null, opts.cost, opts.stock ?? null, opts.limit ?? null],
  );
  await c.end();
  return rows[0].id as string;
}

export { adminClient };
