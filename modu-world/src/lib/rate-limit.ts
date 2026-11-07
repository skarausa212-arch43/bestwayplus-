import "server-only";
import { headers } from "next/headers";
import { withUser } from "./db";
import { hmac } from "./crypto";

/** Hashed client IP (we never store raw IPs). */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
  return hmac(ip, "ip").slice(0, 24);
}

/** Fixed-window limiter stored in Postgres, so it holds across server instances. */
export async function rateLimit(bucket: string, limit: number, windowSeconds: number, subject?: string): Promise<boolean> {
  const key = `${bucket}:${subject ?? (await clientKey())}`;
  return withUser(null, async (db) => {
    const { rows } = await db.query("select app.rate_hit($1, $2, $3) as ok", [key, limit, windowSeconds]);
    return rows[0].ok as boolean;
  });
}
