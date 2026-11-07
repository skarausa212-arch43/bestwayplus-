"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, destroySession } from "@/lib/auth";
import { childSchema, profileSchema } from "@/lib/validation";
import { startTransfer, cancelTransfer, assignToChild } from "@/server/toys";
import { createChild, removeChild, updateProfile, attestAdult, deleteAccount } from "@/server/users";
import { getDict, fmt } from "@/i18n";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";

const uuid = z.string().uuid();

export async function startTransferAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getDict();
  const toyId = uuid.safeParse(fd.get("toyId"));
  if (!toyId.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await startTransfer(user.id, toyId.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: fmt(t.dashboard.transferCreated, { code: res.code }), data: { code: res.code } };
}

export async function cancelTransferAction(fd: FormData) {
  const user = await requireUser();
  const toyId = uuid.parse(fd.get("toyId"));
  await cancelTransfer(user.id, toyId);
  revalidatePath("/dashboard");
}

export async function assignChildAction(fd: FormData) {
  const user = await requireUser();
  const toyId = uuid.parse(fd.get("toyId"));
  const child = fd.get("childId");
  await assignToChild(user.id, toyId, child ? uuid.parse(child) : null);
  revalidatePath("/dashboard");
}

export async function addChildAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getDict();
  const parsed = childSchema.safeParse({
    displayName: fd.get("displayName"),
    birthYear: fd.get("birthYear"),
    consent: fd.get("consent") === "on",
  });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await createChild(user.id, parsed.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: t.common.saved };
}

export async function removeChildAction(fd: FormData) {
  const user = await requireUser();
  await removeChild(user.id, uuid.parse(fd.get("childId")));
  revalidatePath("/dashboard");
}

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getDict();
  const parsed = profileSchema.safeParse({
    displayName: fd.get("displayName"),
    locale: fd.get("locale"),
    publicCollection: fd.get("publicCollection") === "on",
  });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  await updateProfile(user.id, parsed.data);
  return { ok: true, message: t.common.saved };
}

export async function attestAdultAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getDict();
  const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).safeParse(fd.get("birthDate"));
  if (!date.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await attestAdult(user.id, date.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  return { ok: true, message: t.settings.adultDone };
}

export async function deleteAccountAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { t } = await getDict();
  if (fd.get("confirm") !== "DELETE") return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await deleteAccount(user.id);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  await destroySession();
  redirect("/");
}
