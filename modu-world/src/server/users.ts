import "server-only";
import { z } from "zod";
import { callFn, withUser, type FnResult } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { registerSchema, childSchema, profileSchema } from "@/lib/validation";

export async function registerUser(input: z.infer<typeof registerSchema>): Promise<FnResult<{ user_id: string }>> {
  const data = registerSchema.parse(input);
  const hash = await hashPassword(data.password);
  return callFn(null, "register_user", [data.email, hash, data.displayName, null, data.locale ?? "ru"]);
}

/** Returns the user id when the credentials are valid. */
export async function checkCredentials(email: string, password: string): Promise<string | null> {
  const row = await withUser(null, async (db) => {
    const { rows } = await db.query("select * from app.auth_lookup($1)", [email.trim()]);
    return rows[0] as { id: string; password_hash: string; status: string } | undefined;
  });
  const ok = await verifyPassword(password, row?.password_hash ?? null);
  return ok && row && row.status === "active" ? row.id : null;
}

export async function createChild(userId: string, input: z.infer<typeof childSchema>) {
  const data = childSchema.parse(input);
  return callFn<{ child_id: string }>(userId, "create_child", [data.displayName, data.birthYear, "parents-v1"]);
}

export type ChildRow = { id: string; display_name: string; birth_year: number | null; consent_given_at: string };

export async function listChildren(userId: string): Promise<ChildRow[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select u.id, p.display_name, p.birth_year, l.consent_given_at
         from parent_child_links l join users u on u.id = l.child_id join profiles p on p.user_id = u.id
        where l.parent_id = app.uid() order by l.created_at`,
    );
    return rows;
  });
}

export async function removeChild(userId: string, childId: string) {
  // Deleting a child profile removes its achievements and points (cascade). Toys stay with the parent.
  return callFn(userId, "delete_child", [childId]);
}

export async function getProfile(userId: string) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select p.*, u.email, u.roles from profiles p join users u on u.id = p.user_id where p.user_id = $1`,
      [userId],
    );
    return rows[0];
  });
}

export async function updateProfile(userId: string, input: z.infer<typeof profileSchema>) {
  const data = profileSchema.parse(input);
  await withUser(userId, async (db) => {
    await db.query(
      "update profiles set display_name = $2, locale = $3, public_collection = $4, updated_at = now() where user_id = $1",
      [userId, data.displayName, data.locale, data.publicCollection],
    );
    await db.query("select app.audit('profile.update', 'user', $1)", [userId]);
  });
  return { ok: true as const };
}

export async function attestAdult(userId: string, birthDate: string) {
  return callFn(userId, "attest_adult", [birthDate]);
}

export async function deleteAccount(userId: string) {
  return callFn(userId, "delete_my_account", []);
}
