import "server-only";
import { z } from "zod";
import { callFn, withUser } from "@/lib/db";
import { humanCode, randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { batchSchema } from "@/lib/validation";
import { activationCodeHash } from "./toys";
import type { Role } from "@/lib/types";

export type IssuedTag = { serial: string; url: string; token: string; activationCode: string };

export const tagUrl = (token: string) => `${env().APP_URL.replace(/\/$/, "")}/t/${token}`;

/**
 * Creates a batch: random 128-bit public tokens for the NFC URL + one-time activation codes.
 * Codes are returned ONCE (for printing on the in-box card) and only their HMAC is stored.
 */
export async function createBatch(adminId: string, input: z.input<typeof batchSchema>) {
  const d = batchSchema.parse(input);
  const tokens = Array.from({ length: d.quantity }, () => randomToken(16));
  const codes = Array.from({ length: d.quantity }, () => humanCode(2, 4));
  const res = await callFn<{ batch_id: string }>(adminId, "create_batch", [
    d.characterId,
    d.code,
    d.edition,
    d.tagType,
    tokens,
    codes.map(activationCodeHash),
    d.isDemo,
    d.notes || null,
  ]);
  if (!res.ok) return res;
  const serials = await withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select t.serial_number, n.public_token from toy_instances t join nfc_tags n on n.toy_instance_id = t.id
        where t.batch_id = $1 order by t.edition_number`,
      [res.batch_id],
    );
    return new Map(rows.map((r) => [r.public_token as string, r.serial_number as string]));
  });
  const issued: IssuedTag[] = tokens.map((token, i) => ({
    serial: serials.get(token) ?? "",
    token,
    url: tagUrl(token),
    activationCode: codes[i],
  }));
  return { ok: true as const, batchId: res.batch_id, issued };
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    // neutralise spreadsheet formula injection
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export async function reissueActivationCode(adminId: string, toyId: string) {
  const code = humanCode(2, 4);
  const res = await callFn(adminId, "reissue_activation_code", [toyId, activationCodeHash(code)]);
  return res.ok ? { ok: true as const, code } : res;
}

export async function setToyRevoked(adminId: string, toyId: string, revoked: boolean, reason: string) {
  return callFn(adminId, "set_toy_revoked", [toyId, revoked, reason]);
}

export async function listBatches(adminId: string) {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select b.id, b.code, b.quantity, b.edition, b.is_demo, b.created_at, c.name as character_name,
              count(t.id) filter (where t.status <> 'in_stock') as activated
         from toy_batches b join characters c on c.id = b.character_id left join toy_instances t on t.batch_id = b.id
        group by b.id, c.name order by b.created_at desc`,
    );
    return rows as {
      id: string;
      code: string;
      quantity: number;
      edition: string;
      is_demo: boolean;
      created_at: string;
      character_name: string;
      activated: string;
    }[];
  });
}

/** URL-only export for re-encoding tags (activation codes cannot be exported again — they are not stored). */
export async function batchExportRows(adminId: string, batchId: string) {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select t.serial_number, n.public_token, n.tag_type, t.status
         from toy_instances t join nfc_tags n on n.toy_instance_id = t.id
        where t.batch_id = $1 and app.is_admin() order by t.edition_number`,
      [batchId],
    );
    await db.query("select app.audit('batch.export', 'toy_batch', $1)", [batchId]);
    return rows.map((r) => ({
      serial: r.serial_number,
      url: tagUrl(r.public_token),
      tag_type: r.tag_type,
      status: r.status,
      ndef_record: "URI",
    }));
  });
}

export async function searchToys(adminId: string, q: string) {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select t.id, t.serial_number, t.status, t.activated_at, c.name as character_name, n.public_token, n.scan_count,
              n.failed_attempts, n.locked_until, n.status as tag_status, n.tag_type, u.email as owner_email,
              (select count(*) from ownership_transfers o where o.toy_instance_id = t.id) as transfers
         from toy_instances t join characters c on c.id = t.character_id join nfc_tags n on n.toy_instance_id = t.id
         left join users u on u.id = t.owner_user_id
        where app.is_admin() and ($1 = '' or t.serial_number ilike '%' || $1 || '%' or u.email ilike '%' || $1 || '%')
        order by t.created_at desc limit 100`,
      [q.trim()],
    );
    return rows;
  });
}

export async function stats(adminId: string) {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select
         (select count(*) from users where status = 'active' and not ('child' = any(roles))) as accounts,
         (select count(*) from users where 'child' = any(roles)) as children,
         (select count(*) from toy_instances) as toys,
         (select count(*) from toy_instances where status in ('activated', 'transfer_pending')) as activated,
         (select coalesce(sum(scan_count), 0) from nfc_tags) as scans,
         (select count(*) from nfc_tags where scan_count > 1) as rescanned_tags,
         (select count(*) from nfc_tags where failed_attempts > 0 or locked_until > now()) as suspicious_tags,
         (select count(*) from ownership_transfers where status = 'completed') as transfers,
         (select count(*) from school_achievements where status = 'pending') as pending_achievements,
         (select coalesce(sum(amount), 0) from points_transactions where amount > 0) as points_issued,
         (select coalesce(-sum(amount), 0) from points_transactions where amount < 0) as points_spent,
         (select count(*) from coupons where status = 'redeemed') as coupons_redeemed,
         (select count(*) from coupons where status = 'issued') as coupons_open
       where app.is_admin()`,
    );
    const daily = await db.query(
      `select to_char(d, 'MM-DD') as day, count(a.id)::int as activations
         from generate_series(current_date - 13, current_date, interval '1 day') d
         left join activations a on a.created_at::date = d::date
        where app.is_admin() group by d order by d`,
    );
    return { totals: rows[0] as Record<string, string> | undefined, daily: daily.rows as { day: string; activations: number }[] };
  });
}

export async function listUsers(adminId: string, q: string) {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select u.id, u.email, u.roles, u.status, u.is_demo, u.created_at, u.partner_id, p.display_name,
              a.balance, a.id as account_id
         from users u left join profiles p on p.user_id = u.id left join points_accounts a on a.user_id = u.id
        where app.is_admin() and ($1 = '' or u.email ilike '%' || $1 || '%' or p.display_name ilike '%' || $1 || '%')
        order by u.created_at desc limit 100`,
      [q.trim()],
    );
    return rows;
  });
}

export async function setUserRoles(adminId: string, userId: string, roles: Role[], partnerId: string | null) {
  if (userId === adminId && !roles.includes("admin")) return { ok: false as const, error: "SELF_DEMOTE" };
  if (roles.includes("child")) return { ok: false as const, error: "INVALID_INPUT" };
  return withUser(adminId, async (db) => {
    const r = await db.query(
      "update users set roles = $2::app_role[], partner_id = $3 where id = $1 and not ('child' = any(roles))",
      [userId, roles, roles.includes("partner") ? partnerId : null],
    );
    if (!r.rowCount) return { ok: false as const, error: "NOT_FOUND" };
    await db.query("select app.audit('user.roles', 'user', $1, $2)", [userId, { roles, partnerId }]);
    return { ok: true as const };
  });
}

export async function setUserStatus(adminId: string, userId: string, status: "active" | "disabled") {
  if (userId === adminId) return { ok: false as const, error: "SELF_DEMOTE" };
  return withUser(adminId, async (db) => {
    const r = await db.query("update users set status = $2 where id = $1 and status <> 'deleted'", [userId, status]);
    if (!r.rowCount) return { ok: false as const, error: "NOT_FOUND" };
    await db.query("select app.audit('user.status', 'user', $1, $2)", [userId, { status }]);
    return { ok: true as const };
  });
}

export async function auditLog(adminId: string, limit = 200) {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select l.id, l.action, l.entity_type, l.entity_id, l.data, l.created_at, u.email as actor_email
         from audit_logs l left join users u on u.id = l.actor_id order by l.created_at desc limit $1`,
      [limit],
    );
    return rows;
  });
}

export async function listTransfers(adminId: string) {
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `select o.id, o.status, o.created_at, o.completed_at, o.expires_at, t.serial_number, t.id as toy_id,
              fu.email as from_email, tu.email as to_email
         from ownership_transfers o join toy_instances t on t.id = o.toy_instance_id
         left join users fu on fu.id = o.from_user_id left join users tu on tu.id = o.to_user_id
        order by o.created_at desc limit 100`,
    );
    return rows;
  });
}
