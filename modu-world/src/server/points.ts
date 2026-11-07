import "server-only";
import { callFn, withUser } from "@/lib/db";

export type PointsAccount = { id: string; user_id: string; balance: number; display_name: string; is_child: boolean };

/** The user's own account plus the accounts of children they manage. */
export async function accountsFor(userId: string): Promise<PointsAccount[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select a.id, a.user_id, a.balance, p.display_name, (a.user_id <> app.uid()) as is_child
         from points_accounts a join profiles p on p.user_id = a.user_id
        where a.user_id = app.uid() or app.is_guardian_of(a.user_id)
        order by is_child, p.display_name`,
    );
    return rows;
  });
}

export type PointsTx = {
  id: string;
  amount: number;
  balance_after: number;
  kind: string;
  note: string | null;
  created_at: string;
  account_id: string;
  display_name: string;
};

/** `allAccounts` is only meaningful for admins (RLS still filters for everyone else). */
export async function history(userId: string, accountId?: string, limit = 50, allAccounts = false): Promise<PointsTx[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select t.id, t.amount, t.balance_after, t.kind, t.note, t.created_at, t.account_id, p.display_name
         from points_transactions t join points_accounts a on a.id = t.account_id join profiles p on p.user_id = a.user_id
        where ($1::uuid is null or t.account_id = $1)
          and ($3 or a.user_id = app.uid() or app.is_guardian_of(a.user_id))
        order by t.created_at desc limit $2`,
      [accountId ?? null, limit, allAccounts],
    );
    return rows;
  });
}

export async function adjustPoints(adminId: string, accountId: string, amount: number, note: string, key: string) {
  return callFn<{ balance: number }>(adminId, "admin_adjust_points", [accountId, amount, note, key]);
}
