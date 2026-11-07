"use server";

import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { activationSchema, transferAcceptSchema } from "@/lib/validation";
import { activateToy, acceptTransfer } from "@/server/toys";
import { getDict, fmt } from "@/i18n";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";

export async function activateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getDict();
  const user = await getSessionUser();
  if (!user) return { ok: false, error: errMsg(t, "UNAUTHENTICATED") };
  const parsed = activationSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_CODE") };
  // per-IP and per-user limits on top of the per-tag lockout in the database
  if (!(await rateLimit("activate-ip", 15, 600)) || !(await rateLimit("activate-user", 15, 600, user.id))) {
    return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  }
  const res = await activateToy(user.id, parsed.data.token, parsed.data.code, parsed.data.childId || null);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  // No revalidatePath here: the form shows the success state; dynamic pages re-fetch on navigation.
  return { ok: true, message: fmt(t.toy.activated, { serial: res.serial, bonus: res.bonus }) };
}

export async function acceptTransferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const { t } = await getDict();
  const user = await getSessionUser();
  if (!user) return { ok: false, error: errMsg(t, "UNAUTHENTICATED") };
  const parsed = transferAcceptSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_CODE") };
  if (!(await rateLimit("transfer-ip", 15, 600))) return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  const res = await acceptTransfer(user.id, parsed.data.token, parsed.data.code);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  // No revalidatePath here: the form shows the success state; dynamic pages re-fetch on navigation.
  return { ok: true, message: fmt(t.toy.transferAccepted, { serial: res.serial }) };
}
