import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { auditLog } from "@/server/admin";

export default async function AuditPage() {
  const user = await requireRole("admin");
  const { t, locale } = await getDict();
  const rows = await auditLog(user.id);
  return (
    <div>
      <h1 className="text-2xl font-bold">{t.admin.auditTitle}</h1>
      <div className="mt-4 overflow-x-auto rounded-3xl border border-line">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead className="text-muted">
            <tr><th className="px-3 py-2">{t.common.date}</th><th className="px-3 py-2">{t.admin.actor}</th><th className="px-3 py-2">{t.admin.action}</th><th className="px-3 py-2">{t.admin.entity}</th><th className="px-3 py-2">data</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="whitespace-nowrap px-3 py-2 text-muted">{dateFmt(r.created_at, locale, true)}</td>
                <td className="px-3 py-2">{r.actor_email ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-peach">{r.action}</td>
                <td className="px-3 py-2 font-mono">{r.entity_type}:{String(r.entity_id ?? "").slice(0, 8)}</td>
                <td className="max-w-xs truncate px-3 py-2 font-mono text-muted">{JSON.stringify(r.data)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
