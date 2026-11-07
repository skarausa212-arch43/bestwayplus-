"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { batchSchema, reviewSchema, adjustPointsSchema, rewardSchema, partnerSchema } from "@/lib/validation";
import { createBatch, reissueActivationCode, setToyRevoked, setUserRoles, setUserStatus, type IssuedTag } from "@/server/admin";
import { reviewAchievement } from "@/server/school";
import { adjustPoints } from "@/server/points";
import { saveReward, savePartner, setPartnerStatus, cancelRedemption, redeemCoupon } from "@/server/rewards";
import { cancelTransfer } from "@/server/toys";
import { getDict, fmt } from "@/i18n";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";
import type { Role } from "@/lib/types";

const uuid = z.string().uuid();
const admin = () => requireRole("admin", "/admin");

export async function createBatchAction(_: unknown, fd: FormData): Promise<(ActionState & { issued?: IssuedTag[]; code?: string }) | null> {
  const user = await admin();
  const { t } = await getDict();
  const parsed = batchSchema.safeParse({
    characterId: fd.get("characterId"),
    quantity: fd.get("quantity"),
    code: fd.get("code"),
    edition: fd.get("edition"),
    tagType: fd.get("tagType"),
    isDemo: fd.get("isDemo") === "on",
    notes: fd.get("notes") || undefined,
  });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await createBatch(user.id, parsed.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, issued: res.issued, code: parsed.data.code };
}

export async function reissueCodeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await admin();
  const { t } = await getDict();
  const res = await reissueActivationCode(user.id, uuid.parse(fd.get("toyId")));
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: fmt(t.admin.reissued, { serial: String(fd.get("serial")), code: res.code }) };
}

export async function revokeToyAction(fd: FormData) {
  const user = await admin();
  await setToyRevoked(user.id, uuid.parse(fd.get("toyId")), fd.get("revoke") === "1", "admin panel");
  revalidatePath("/admin/toys");
}

export async function cancelTransferAdminAction(fd: FormData) {
  const user = await admin();
  await cancelTransfer(user.id, uuid.parse(fd.get("toyId")));
  revalidatePath("/admin/toys");
}

export async function reviewAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await admin();
  const { t } = await getDict();
  const parsed = reviewSchema.safeParse({
    achievementId: fd.get("achievementId"),
    decision: fd.get("decision"),
    points: fd.get("points") || undefined,
    comment: fd.get("comment") || undefined,
  });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await reviewAchievement(user.id, parsed.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: `${t.school.status[parsed.data.decision]} · +${res.points} MP` };
}

export async function adjustPointsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await admin();
  const { t } = await getDict();
  const parsed = adjustPointsSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const d = parsed.data;
  const res = await adjustPoints(user.id, d.accountId, d.amount, d.note, d.idempotencyKey);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: `${t.common.saved} · ${res.balance} MP` };
}

export async function saveRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await admin();
  const { t } = await getDict();
  const opt = (k: string) => (fd.get(k) ? fd.get(k) : undefined);
  const parsed = rewardSchema.safeParse({
    id: opt("id"),
    slug: fd.get("slug"),
    partnerId: fd.get("partnerId") ?? "",
    titleRu: fd.get("titleRu"),
    titleEn: fd.get("titleEn"),
    descriptionRu: opt("descriptionRu"),
    descriptionEn: opt("descriptionEn"),
    category: fd.get("category"),
    costPoints: fd.get("costPoints"),
    stock: opt("stock"),
    perUserLimit: opt("perUserLimit"),
    validUntil: opt("validUntil"),
    couponTtlDays: fd.get("couponTtlDays") || 30,
    isActive: fd.get("isActive") === "on",
  });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await saveReward(user.id, parsed.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: t.common.saved };
}

export async function savePartnerAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await admin();
  const { t } = await getDict();
  const parsed = partnerSchema.safeParse({
    slug: fd.get("slug"),
    name: fd.get("name"),
    website: fd.get("website") ?? "",
    isConcept: fd.get("isConcept") === "on",
    descriptionRu: fd.get("descriptionRu") || undefined,
    descriptionEn: fd.get("descriptionEn") || undefined,
  });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  await savePartner(user.id, parsed.data);
  return { ok: true, message: t.common.saved };
}

export async function partnerStatusAction(fd: FormData) {
  const user = await admin();
  await setPartnerStatus(user.id, uuid.parse(fd.get("id")), fd.get("status") === "paused" ? "paused" : "active");
  revalidatePath("/admin/rewards");
  revalidatePath("/rewards");
}

export async function cancelRedemptionAction(fd: FormData) {
  const user = await admin();
  await cancelRedemption(user.id, uuid.parse(fd.get("redemptionId")), "admin panel");
  revalidatePath("/admin/coupons");
}

export async function adminRedeemCouponAction(fd: FormData) {
  const user = await admin();
  await redeemCoupon(user.id, String(fd.get("code")));
  revalidatePath("/admin/coupons");
}

const ROLES: Role[] = ["parent", "collector", "partner", "admin"];

export async function setRolesAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await admin();
  const { t } = await getDict();
  const roles = ROLES.filter((r) => fd.get(`role_${r}`) === "on");
  if (!roles.length) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const partnerId = fd.get("partnerId") ? uuid.parse(fd.get("partnerId")) : null;
  const res = await setUserRoles(user.id, uuid.parse(fd.get("userId")), roles, partnerId);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: t.common.saved };
}

export async function setStatusAction(fd: FormData) {
  const user = await admin();
  await setUserStatus(user.id, uuid.parse(fd.get("userId")), fd.get("status") === "disabled" ? "disabled" : "active");
  revalidatePath("/admin/users");
}
