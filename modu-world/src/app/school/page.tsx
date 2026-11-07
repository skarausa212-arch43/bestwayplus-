import Link from "next/link";
import { TrendingUp, ShieldCheck, Trash2, Link2Off, GraduationCap } from "lucide-react";
import { getDict, fmt } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { getSessionUser } from "@/lib/auth";
import { listChildren } from "@/server/users";
import { listForGuardian } from "@/server/school";
import { PageHero } from "@/components/page-hero";
import { Badge, EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/form";
import { AchievementForm } from "./achievement-form";
import { deleteAchievementAction } from "./actions";

export const metadata = { title: "MODU School" };
export const dynamic = "force-dynamic";

const ICONS = [TrendingUp, ShieldCheck, Trash2, Link2Off];

export default async function SchoolPage() {
  const [{ t, locale }, user] = await Promise.all([getDict(), getSessionUser()]);
  const s = t.school;
  const isParent = !!user?.roles.includes("parent");
  const [children, items] = isParent ? await Promise.all([listChildren(user!.id), listForGuardian(user!.id)]) : [[], []];

  return (
    <>
      <PageHero eyebrow={s.eyebrow} title={s.title} text={s.text} />
      <section className="container-x grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {s.rules.map((r, i) => {
          const Icon = ICONS[i];
          return (
            <div key={r.title} className="card p-5">
              <Icon className="size-6 text-peach" />
              <h2 className="mt-4 font-display text-base font-bold">{r.title}</h2>
              <p className="mt-2 text-sm text-cream/65">{r.text}</p>
            </div>
          );
        })}
      </section>

      <section className="container-x mt-10 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="card p-6 sm:p-8">
          <h2 className="flex items-center gap-2 text-2xl font-bold">
            <GraduationCap className="size-6 text-peach" /> {s.addTitle}
          </h2>
          <div className="mt-6">
            {!user ? (
              <div className="grid gap-3">
                <p className="text-cream/75">{s.loginCta}</p>
                <Button asChild>
                  <Link href="/login?next=/school">{t.nav.login}</Link>
                </Button>
              </div>
            ) : !isParent ? (
              <p className="text-muted">{fmt(t.dashboard.denied, { role: "parent" })}</p>
            ) : children.length === 0 ? (
              <div className="grid gap-3">
                <p className="text-cream/75">{s.needChild}</p>
                <Button asChild variant="outline">
                  <Link href="/dashboard">{t.dashboard.addChild}</Link>
                </Button>
              </div>
            ) : (
              <AchievementForm
                childOptions={children.map((c) => ({ id: c.id, name: c.display_name }))}
                labels={{ ...s, kinds: s.kinds, optional: t.common.optional } as never}
              />
            )}
          </div>
        </div>

        <div className="card h-fit p-6 sm:p-8">
          <h2 className="text-xl font-bold">{s.table}</h2>
          <table className="mt-4 w-full text-sm">
            <tbody>
              {s.tableRows.map(([k, v]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-3 pr-4 text-cream/80">{k}</td>
                  <td className="py-3 text-right font-display font-bold text-peach">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isParent && (
        <section className="container-x mt-10">
          <h2 className="text-2xl font-bold">{s.list}</h2>
          {items.length === 0 ? (
            <div className="mt-4">
              <EmptyState title={s.noItems} />
            </div>
          ) : (
            <ul className="mt-4 grid gap-3">
              {items.map((a) => (
                <li key={a.id} className="card flex flex-wrap items-center gap-4 p-4" data-testid="achievement">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {s.kinds[a.kind as keyof typeof s.kinds]} · {a.subject}
                      {a.current_value !== null && (
                        <span className="text-muted">
                          {" "}
                          · {a.previous_value !== null ? `${a.previous_value} → ` : ""}
                          {a.current_value}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted">
                      {a.child_name} · {a.period} · {dateFmt(a.created_at, locale)}
                      {a.evidence_deleted && ` · ${s.evidenceDeleted}`}
                      {a.review_comment && ` · “${a.review_comment}”`}
                    </div>
                  </div>
                  <Badge tone={a.status === "approved" ? "success" : a.status === "rejected" ? "danger" : "gold"}>{s.status[a.status]}</Badge>
                  {a.status === "approved" && <span className="font-display font-bold text-success">{fmt(s.awarded, { points: a.points_awarded })}</span>}
                  <ActionButton action={deleteAchievementAction} fields={{ id: a.id }} variant="ghost" size="sm" confirm={t.common.delete + "?"}>
                    <Trash2 /> <span className="sr-only">{t.common.delete}</span>
                  </ActionButton>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}
