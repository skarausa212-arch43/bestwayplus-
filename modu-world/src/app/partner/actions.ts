"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { redeemCoupon } from "@/server/rewards";
import { getDict, fmt } from "@/i18n";
import { tl } from "@/i18n/format";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";

/** Used by partner staff and admins. Permission is checked inside app.redeem_coupon. */
export async function redeemCouponAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t, locale } = await getDict();
  const user = await getSessionUser();
  if (!user) return { ok: false, error: errMsg(t, "UNAUTHENTICATED") };
  const code = z.string().trim().min(6).max(20).safeParse(fd.get("code"));
  if (!code.success) return { ok: false, error: errMsg(t, "NOT_FOUND") };
  if (!(await rateLimit("coupon", 30, 600, user.id))) return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  const res = await redeemCoupon(user.id, code.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  revalidatePath("/partner");
  revalidatePath("/admin/coupons");
  return { ok: true, message: fmt(t.partner.redeemed, { title: tl(res.reward_title, locale) }) };
}
