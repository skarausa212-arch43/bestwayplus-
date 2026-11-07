"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { redeemSchema } from "@/lib/validation";
import { redeemReward } from "@/server/rewards";
import { getDict, fmt } from "@/i18n";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";

export async function redeemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/rewards");
  const { t } = await getDict();
  const parsed = redeemSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  if (!(await rateLimit("redeem", 20, 600, user.id))) return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  // The idempotency key comes from the form: a double click or a retried request returns the same coupon.
  const res = await redeemReward(user.id, parsed.data.accountId, parsed.data.rewardId, parsed.data.idempotencyKey);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  revalidatePath("/rewards");
  revalidatePath("/dashboard");
  return { ok: true, message: fmt(t.rewards.redeemed, { code: res.coupon_code }), data: { code: res.coupon_code } };
}
