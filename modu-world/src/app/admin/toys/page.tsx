import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { searchToys, listTransfers } from "@/server/admin";
import { Badge } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/form";
import { ReissueForm } from "../forms";
import { revokeToyAction, cancelTransferAdminAction } from "../actions";

export default async function ToysPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole("admin");
  const { q = "" } = await searchParams;
  const { t, locale } = await getDict();
  const [toys, transfers] = await Promise.all([searchToys(user.id, q), listTransfers(user.id)]);
  return (
    <div className="grid gap-8">
      <section>
        <h1 className="text-2xl font-bold">{t.admin.nav.toys}</h1>
        <form className="mt-4 flex gap-2">
          <input name="q" defaultValue={q} placeholder={t.admin.toysSearch} aria-label={t.admin.toysSearch} className="field" />
        </form>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-line">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-3 py-2">Serial</th><th className="px-3 py-2">{t.common.status}</th><th className="px-3 py-2">Owner</th>
                <th className="px-3 py-2">{t.admin.scans}</th><th className="px-3 py-2">{t.admin.fails}</th><th className="px-3 py-2">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {toys.map((x) => (
                <tr key={x.id} className="border-t border-line align-top">
                  <td className="px-3 py-2">
                    <a className="font-mono hover:text-peach" href={`/t/${x.public_token}`}>{x.serial_number}</a>
                    <div className="text-xs text-muted">{x.character_name} · {x.tag_type}</div>
                  </td>
                  <td className="px-3 py-2"><Badge tone={x.status === "revoked" ? "danger" : x.status === "in_stock" ? "peach" : "success"}>{x.status}</Badge></td>
                  <td className="px-3 py-2 text-xs">{x.owner_email ?? "—"}<div className="text-muted">{dateFmt(x.activated_at, locale)}</div></td>
                  <td className="px-3 py-2">{x.scan_count}</td>
                  <td className="px-3 py-2">{x.failed_attempts}{x.locked_until && new Date(x.locked_until) > new Date() ? " 🔒" : ""}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {x.status === "in_stock" && <ReissueForm toyId={x.id} serial={x.serial_number} label={t.admin.reissue} />}
                      {x.status === "transfer_pending" && (
                        <ActionButton action={cancelTransferAdminAction} fields={{ toyId: x.id }} size="sm" variant="ghost">{t.dashboard.cancelTransfer}</ActionButton>
                      )}
                      <ActionButton action={revokeToyAction} fields={{ toyId: x.id, revoke: x.status === "revoked" ? "0" : "1" }} size="sm" variant={x.status === "revoked" ? "outline" : "danger"} confirm="?">
                        {x.status === "revoked" ? t.admin.restore : t.admin.revoke}
                      </ActionButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section>
        <h2 className="text-xl font-bold">{t.admin.transfersTitle}</h2>
        <ul className="mt-4 grid gap-2">
          {transfers.map((x) => (
            <li key={x.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span className="font-mono">{x.serial_number}</span>
              <span className="text-xs text-muted">{x.from_email ?? "—"} → {x.to_email ?? "…"}</span>
              <span className="flex items-center gap-2 text-xs"><Badge>{x.status}</Badge>{dateFmt(x.completed_at ?? x.created_at, locale, true)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
