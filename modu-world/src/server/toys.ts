import "server-only";
import { callFn, withUser, type FnResult } from "@/lib/db";
import { hmac, humanCode, normalizeCode } from "@/lib/crypto";
import type { CharacterContent } from "@/lib/types";

export type Passport = {
  toy_id: string;
  serial: string;
  edition_number: number;
  batch_quantity: number;
  batch_code: string;
  edition: string;
  is_demo: boolean;
  status: "in_stock" | "activated" | "transfer_pending" | "revoked";
  activated_at: string | null;
  tag_type: string;
  locked: boolean;
  is_owner: boolean;
  owner_public_name: string | null;
  transfers: number;
  character: { slug: string; name: string; rarity: string; image_path: string; series: string; content: CharacterContent };
};

export const isValidToken = (t: string) => /^[A-Za-z0-9_-]{20,64}$/.test(t);

/** Public digital passport for a scanned tag. Never exposes the owner's identity. */
export async function getPassport(token: string, userId: string | null): Promise<FnResult<Passport>> {
  if (!isValidToken(token)) return { ok: false, error: "NOT_FOUND" };
  return callFn<Passport>(userId, "toy_passport", [token]);
}

export const activationCodeHash = (code: string) => hmac(normalizeCode(code), "activation");
export const transferCodeHash = (code: string) => hmac(normalizeCode(code), "transfer");

export async function activateToy(userId: string, token: string, code: string, childId?: string | null) {
  return callFn<{ toy_id: string; serial: string; bonus: number }>(userId, "activate_toy", [
    token,
    activationCodeHash(code),
    childId || null,
  ]);
}

/** Starts a transfer and returns the one-time code to give to the new owner (shown once, stored hashed). */
export async function startTransfer(userId: string, toyId: string): Promise<FnResult<{ code: string }>> {
  const code = humanCode(3, 4);
  const res = await callFn(userId, "create_transfer", [toyId, transferCodeHash(code), 72]);
  return res.ok ? { ok: true, code } : res;
}

export async function cancelTransfer(userId: string, toyId: string) {
  return callFn(userId, "cancel_transfer", [toyId]);
}

export async function acceptTransfer(userId: string, token: string, code: string) {
  return callFn<{ toy_id: string; serial: string }>(userId, "accept_transfer", [token, transferCodeHash(code)]);
}

export type MyToy = {
  id: string;
  serial_number: string;
  edition_number: number;
  status: string;
  activated_at: string;
  assigned_child_id: string | null;
  child_name: string | null;
  public_token: string;
  slug: string;
  name: string;
  rarity: string;
  image_path: string;
  certificate_status: string | null;
};

export async function myToys(userId: string): Promise<MyToy[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select t.id, t.serial_number, t.edition_number, t.status, t.activated_at, t.assigned_child_id,
              cp.display_name as child_name, n.public_token, c.slug, c.name, c.rarity, c.image_path,
              dc.status as certificate_status
         from toy_instances t
         join characters c on c.id = t.character_id
         join nfc_tags n on n.toy_instance_id = t.id
         left join profiles cp on cp.user_id = t.assigned_child_id
         left join digital_collectibles dc on dc.toy_instance_id = t.id and dc.kind = 'certificate'
        where t.owner_user_id = app.uid()
        order by t.activated_at desc`,
    );
    return rows;
  });
}

export async function assignToChild(userId: string, toyId: string, childId: string | null) {
  return withUser(userId, async (db) => {
    if (childId) {
      const { rows } = await db.query("select app.is_guardian_of($1) as ok", [childId]);
      if (!rows[0].ok) return { ok: false as const, error: "FORBIDDEN" };
    }
    const r = await db.query("update toy_instances set assigned_child_id = $2 where id = $1 and owner_user_id = app.uid()", [
      toyId,
      childId,
    ]);
    return r.rowCount ? { ok: true as const } : { ok: false as const, error: "NOT_FOUND" };
  });
}

export async function ownershipHistory(userId: string, toyId: string) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select 'activation' as event, a.created_at from activations a
         join toy_instances t on t.id = a.toy_instance_id where t.id = $1 and t.owner_user_id = app.uid()
       union all
       select 'transfer_' || o.status, coalesce(o.completed_at, o.created_at) from ownership_transfers o
         join toy_instances t on t.id = o.toy_instance_id where t.id = $1 and t.owner_user_id = app.uid()
       order by 2`,
      [toyId],
    );
    return rows as { event: string; created_at: string }[];
  });
}
