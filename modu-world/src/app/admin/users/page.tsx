import { requireRole, parseRoles } from "@/lib/auth";
import { getDict } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { listUsers } from "@/server/admin";
import { listPartners } from "@/server/rewards";
import { Badge } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/form";
import { RolesForm } from "../forms";
import { setStatusAction } from "../actions";

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireRole("admin");
  const { q = "" } = await searchParams;
  const { t, locale } = await getDict();
  const [users, partners] = await Promise.all([listUsers(user.id, q), listPartners(user.id)]);
  return (
    <div>
      <h1 className="text-2xl font-bold">{t.admin.nav.users}</h1>
      <form className="mt-4"><input name="q" defaultValue={q} placeholder={t.admin.usersSearch} aria-label={t.admin.usersSearch} className="field" /></form>
      <ul className="mt-4 grid gap-3">
        {users.map((u) => {
          const roles = parseRoles(u.roles);
          const isChild = roles.includes("child");
          return (
            <li key={u.id} className="card p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-semibold">{u.display_name}</span> <span className="text-sm text-muted">{u.email ?? ""}</span>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {roles.map((r) => <Badge key={r} tone={r === "admin" ? "gold" : "neutral"}>{r}</Badge>)}
                    {u.is_demo && <Badge tone="demo">DEMO</Badge>}
                    {u.status !== "active" && <Badge tone="danger">{u.status}</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted">
                  {dateFmt(u.created_at, locale)}
                  {!isChild && u.id !== user.id && u.status !== "deleted" && (
                    <ActionButton action={setStatusAction} fields={{ userId: u.id, status: u.status === "active" ? "disabled" : "active" }} size="sm" variant={u.status === "active" ? "danger" : "outline"}>
                      {u.status === "active" ? t.admin.disable : t.admin.enable}
                    </ActionButton>
                  )}
                </div>
              </div>
              {!isChild && u.status !== "deleted" && (
                <div className="mt-3 border-t border-line pt-3">
                  <RolesForm userId={u.id} roles={roles} partnerId={u.partner_id} partners={partners.map((p) => ({ id: p.id, name: p.name }))} labels={{ save: t.common.save }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
