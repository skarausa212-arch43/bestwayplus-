import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { listUsers } from "@/server/admin";
import { history } from "@/server/points";
import { Badge, PointsPill } from "@/components/ui/misc";
import { AdjustForm } from "../forms";

export default async function PointsAdminPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole("admin");
  const { q = "" } = await searchParams;
  const { t, locale } = await getDict();
  const [users, ledger] = await Promise.all([listUsers(user.id, q), history(user.id, undefined, 50, true)]);
  return (
    <div className="grid gap-8">
      <section>
        <h1 className="text-2xl font-bold">{t.admin.adjustTitle}</h1>
        <form className="mt-4"><input name="q" defaultValue={q} placeholder={t.admin.usersSearch} aria-label={t.admin.usersSearch} className="field" /></form>
        <ul className="mt-4 grid gap-3">
          {users.filter((u) => u.account_id).slice(0, 20).map((u) => (
            <li key={u.id} className="card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>{u.display_name} <span className="text-muted">{u.email ?? "(child)"}</span></span>
                <PointsPill value={u.balance} size="sm" />
              </div>
              <AdjustForm accountId={u.account_id} labels={t.admin} />
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="text-xl font-bold">{t.admin.ledger}</h2>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {ledger.map((x) => (
                <tr key={x.id} className="border-t border-line first:border-0">
                  <td className="px-4 py-2 text-xs text-muted">{dateFmt(x.created_at, locale, true)}</td>
                  <td className="px-4 py-2">{x.display_name}</td>
                  <td className="px-4 py-2"><Badge>{x.kind}</Badge></td>
                  <td className="px-4 py-2 text-xs text-muted">{x.note}</td>
                  <td className={`px-4 py-2 text-right font-bold ${x.amount > 0 ? "text-success" : ""}`}>{x.amount > 0 ? "+" : ""}{x.amount}</td>
                  <td className="px-4 py-2 text-right text-muted">{x.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
