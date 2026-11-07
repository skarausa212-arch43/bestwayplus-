import "server-only";
import { z } from "zod";
import { callFn, withUser } from "@/lib/db";
import { partnerSchema, rewardSchema } from "@/lib/validation";
import type { LocalizedText } from "@/lib/types";

export type Partner = {
  id: string;
  slug: string;
  name: string;
  description: LocalizedText;
  website: string | null;
  is_concept: boolean;
  disclaimer: LocalizedText;
  status: string;
  is_demo: boolean;
};

export type Reward = {
  id: string;
  slug: string;
  title: LocalizedText;
  description: LocalizedText;
  category: string;
  cost_points: number;
  stock: number | null;
  per_user_limit: number | null;
  valid_until: string | null;
  coupon_ttl_days: number;
  image_path: string | null;
  is_active: boolean;
  is_demo: boolean;
  partner_id: string | null;
  partner_name: string | null;
  partner_is_concept: boolean | null;
  partner_disclaimer: LocalizedText | null;
};

export async function listRewards(userId: string | null, includeInactive = false): Promise<Reward[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select r.*, p.name as partner_name, p.is_concept as partner_is_concept, p.disclaimer as partner_disclaimer
         from reward_catalog r left join partners p on p.id = r.partner_id
        where ($1 or (r.is_active and (r.valid_until is null or r.valid_until > now())
                      and (r.valid_from is null or r.valid_from <= now()) and (r.partner_id is null or p.status = 'active')))
        order by r.cost_points`,
      [includeInactive],
    );
    return rows;
  });
}

export async function listPartners(userId: string | null): Promise<Partner[]> {
  return withUser(userId, async (db) => (await db.query("select * from partners order by is_concept, name")).rows);
}

export async function redeemReward(userId: string, accountId: string, rewardId: string, idempotencyKey: string) {
  return callFn<{ redemption_id: string; coupon_code: string; balance: number; replayed: boolean }>(
    userId,
    "redeem_reward",
    [accountId, rewardId, idempotencyKey],
  );
}

export type Redemption = {
  id: string;
  status: string;
  points_spent: number;
  created_at: string;
  title: LocalizedText;
  code: string;
  coupon_status: string;
  expires_at: string;
  display_name: string;
  partner_name: string | null;
};

export async function myRedemptions(userId: string): Promise<Redemption[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select r.id, r.status, r.points_spent, r.created_at, rc.title, c.code, c.status as coupon_status, c.expires_at,
              p.display_name, pa.name as partner_name
         from reward_redemptions r join reward_catalog rc on rc.id = r.reward_id
         join coupons c on c.redemption_id = r.id
         join points_accounts a on a.id = r.account_id join profiles p on p.user_id = a.user_id
         left join partners pa on pa.id = rc.partner_id
        where a.user_id = app.uid() or app.is_guardian_of(a.user_id)
        order by r.created_at desc limit 50`,
    );
    return rows;
  });
}

export async function redeemCoupon(userId: string, code: string) {
  return callFn<{ reward_title: LocalizedText }>(userId, "redeem_coupon", [code]);
}

export async function cancelRedemption(adminId: string, redemptionId: string, reason: string) {
  return callFn(adminId, "cancel_redemption", [redemptionId, reason]);
}

export async function listCoupons(userId: string, limit = 100) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select c.id, c.code, c.status, c.expires_at, c.redeemed_at, c.created_at, c.redemption_id, rc.title, pa.name as partner_name
         from coupons c join reward_catalog rc on rc.id = c.reward_id left join partners pa on pa.id = c.partner_id
        where app.is_admin() or (c.partner_id is not null and c.partner_id = app.my_partner_id())
        order by c.created_at desc limit $1`,
      [limit],
    );
    return rows as {
      id: string;
      code: string;
      status: string;
      expires_at: string;
      redeemed_at: string | null;
      created_at: string;
      redemption_id: string;
      title: LocalizedText;
      partner_name: string | null;
    }[];
  });
}

// ───────── Admin ─────────
export async function saveReward(adminId: string, input: z.input<typeof rewardSchema>) {
  const d = rewardSchema.parse(input);
  return withUser(adminId, async (db) => {
    const params = [
      d.slug,
      d.partnerId || null,
      { ru: d.titleRu, en: d.titleEn },
      { ru: d.descriptionRu ?? "", en: d.descriptionEn ?? "" },
      d.category,
      d.costPoints,
      d.stock ?? null,
      d.perUserLimit ?? null,
      d.validUntil ? new Date(d.validUntil) : null,
      d.couponTtlDays,
      d.isActive,
    ];
    const sql = d.id
      ? `update reward_catalog set slug=$1, partner_id=$2, title=$3, description=$4, category=$5, cost_points=$6, stock=$7,
           per_user_limit=$8, valid_until=$9, coupon_ttl_days=$10, is_active=$11 where id = $12 returning id`
      : `insert into reward_catalog (slug, partner_id, title, description, category, cost_points, stock, per_user_limit,
           valid_until, coupon_ttl_days, is_active) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`;
    const { rows } = await db.query(sql, d.id ? [...params, d.id] : params);
    if (!rows.length) return { ok: false as const, error: "FORBIDDEN" };
    await db.query("select app.audit($1, 'reward', $2, $3)", [d.id ? "reward.update" : "reward.create", rows[0].id, { slug: d.slug }]);
    return { ok: true as const, id: rows[0].id as string };
  });
}

export async function savePartner(adminId: string, input: z.input<typeof partnerSchema>) {
  const d = partnerSchema.parse(input);
  return withUser(adminId, async (db) => {
    const { rows } = await db.query(
      `insert into partners (slug, name, website, is_concept, description, disclaimer)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (slug) do update set name = excluded.name, website = excluded.website, is_concept = excluded.is_concept,
         description = excluded.description, disclaimer = excluded.disclaimer
       returning id`,
      [
        d.slug,
        d.name,
        d.website || null,
        d.isConcept,
        { ru: d.descriptionRu ?? "", en: d.descriptionEn ?? "" },
        d.isConcept
          ? { ru: "Концепт, партнёрство не подтверждено", en: "Concept — partnership not confirmed" }
          : {},
      ],
    );
    await db.query("select app.audit('partner.save', 'partner', $1, $2)", [rows[0].id, { slug: d.slug }]);
    return { ok: true as const, id: rows[0].id as string };
  });
}

export async function setPartnerStatus(adminId: string, id: string, status: "active" | "paused") {
  return withUser(adminId, async (db) => {
    const r = await db.query("update partners set status = $2 where id = $1", [id, status]);
    if (!r.rowCount) return { ok: false as const, error: "FORBIDDEN" };
    await db.query("select app.audit('partner.status', 'partner', $1, $2)", [id, { status }]);
    return { ok: true as const };
  });
}
