"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { achievementSchema } from "@/lib/validation";
import { submitAchievement, deleteAchievement } from "@/server/school";
import { getDict, fmt } from "@/i18n";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";

export async function submitAchievementAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/school");
  const { t } = await getDict();
  const num = (k: string) => (fd.get(k) === "" || fd.get(k) === null ? undefined : fd.get(k));
  const parsed = achievementSchema.safeParse({
    childId: fd.get("childId"),
    kind: fd.get("kind"),
    subject: fd.get("subject"),
    period: fd.get("period"),
    previousValue: num("previousValue"),
    currentValue: num("currentValue"),
    description: fd.get("description") || undefined,
  });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  if (!(await rateLimit("school-submit", 20, 3600, user.id))) return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  const file = fd.get("evidence");
  const res = await submitAchievement(user.id, parsed.data, file instanceof File ? file : null);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: fmt(t.school.submitted, { points: res.suggested_points }) };
}

export async function deleteAchievementAction(fd: FormData) {
  const user = await requireUser("/school");
  await deleteAchievement(user.id, z.string().uuid().parse(fd.get("id")));
  revalidatePath("/school");
}
