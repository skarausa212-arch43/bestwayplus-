import "server-only";
import { Pool, type PoolClient } from "pg";
import { env } from "./env";

declare global {
  var __moduPool: Pool | undefined;
}

export function pool(): Pool {
  if (!globalThis.__moduPool) {
    globalThis.__moduPool = new Pool({ connectionString: env().DATABASE_URL, max: 10 });
  }
  return globalThis.__moduPool;
}

export type Db = Pick<PoolClient, "query">;

/**
 * Runs `fn` in one transaction with the acting user bound to `app.user_id`,
 * which every RLS policy and SECURITY DEFINER function reads.
 */
export async function withUser<T>(userId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const client = await pool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.user_id', $1, true)", [userId ?? ""]);
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export type FnResult<T = Record<string, unknown>> = ({ ok: true } & T) | { ok: false; error: string };

/** Calls one of the app.* business functions that return {ok, ...}. */
export async function callFn<T = Record<string, unknown>>(
  userId: string | null,
  fn: string,
  args: unknown[],
): Promise<FnResult<T>> {
  if (!/^[a-z_]+$/.test(fn)) throw new Error("invalid function name");
  const placeholders = args.map((_, i) => `$${i + 1}`).join(", ");
  return withUser(userId, async (db) => {
    const { rows } = await db.query(`select app.${fn}(${placeholders}) as r`, args);
    return rows[0].r as FnResult<T>;
  });
}
