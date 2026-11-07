import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { randomToken, hmac } from "./crypto";
import { withUser } from "./db";
import { env } from "./env";
import type { Role } from "./types";

export const SESSION_COOKIE = "modu_session";
const SESSION_TTL_HOURS = 24 * 14;

export type SessionUser = {
  id: string;
  email: string | null;
  roles: Role[];
  displayName: string;
  locale: string;
  partnerId: string | null;
  isDemo: boolean;
  adult: boolean;
};

export async function createSession(userId: string) {
  const token = randomToken(32);
  const ua = (await headers()).get("user-agent") ?? "";
  await withUser(null, (db) =>
    db.query("select app.session_create($1, $2, $3, $4)", [userId, hmac(token, "session"), SESSION_TTL_HOURS, ua]),
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().SECURE_COOKIES ? env().SECURE_COOKIES === "true" : env().NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_HOURS * 3600,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    await withUser(null, (db) => db.query("select app.session_delete($1)", [hmac(token, "session")]));
  }
  jar.delete(SESSION_COOKIE);
}

/** Current user (memoised per request). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const userId = await withUser(null, async (db) => {
    const { rows } = await db.query("select app.session_get($1) as id", [hmac(token, "session")]);
    return (rows[0]?.id as string | null) ?? null;
  });
  if (!userId) return null;
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select u.id, u.email, u.roles, u.partner_id, u.is_demo, p.display_name, p.locale, p.adult_attested_at
         from users u join profiles p on p.user_id = u.id where u.id = $1`,
      [userId],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      email: r.email,
      roles: parseRoles(r.roles),
      displayName: r.display_name,
      locale: r.locale,
      partnerId: r.partner_id,
      isDemo: r.is_demo,
      adult: !!r.adult_attested_at,
    };
  });
});

export function parseRoles(v: unknown): Role[] {
  if (Array.isArray(v)) return v as Role[];
  if (typeof v === "string") return v.replace(/[{}]/g, "").split(",").filter(Boolean) as Role[];
  return [];
}

export async function requireUser(next?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`);
  return user;
}

export async function requireRole(role: Role, next?: string): Promise<SessionUser> {
  const user = await requireUser(next);
  if (!user.roles.includes(role)) redirect("/dashboard?denied=" + role);
  return user;
}

/** Only allow same-site relative redirects after login (open-redirect protection). */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return "/dashboard";
  return next;
}
