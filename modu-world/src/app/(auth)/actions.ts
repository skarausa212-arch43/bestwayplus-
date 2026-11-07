"use server";

import { redirect } from "next/navigation";
import { createSession, safeNext } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { loginSchema, registerSchema } from "@/lib/validation";
import { checkCredentials, registerUser } from "@/server/users";
import { getDict } from "@/i18n";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";

export async function loginAction(input: { email: string; password: string; next?: string }): Promise<ActionState> {
  const { t } = await getDict();
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: errMsg(t, "BAD_CREDENTIALS") };
  if (!(await rateLimit("login-ip", 20, 600)) || !(await rateLimit("login-email", 8, 900, parsed.data.email))) {
    return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  }
  const userId = await checkCredentials(parsed.data.email, parsed.data.password);
  if (!userId) return { ok: false, error: errMsg(t, "BAD_CREDENTIALS") };
  await createSession(userId);
  redirect(safeNext(input.next));
}

export async function registerAction(input: Record<string, unknown> & { next?: string }): Promise<ActionState> {
  const { t, locale } = await getDict();
  const parsed = registerSchema.safeParse({ ...input, locale });
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  if (!(await rateLimit("register-ip", 5, 3600))) return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  const res = await registerUser(parsed.data);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  await createSession(res.user_id);
  redirect(safeNext(input.next));
}
