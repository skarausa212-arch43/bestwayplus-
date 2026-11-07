import { FileSearch } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getDict, fmt } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { reviewQueue } from "@/server/school";
import { Badge, EmptyState } from "@/components/ui/misc";
import { ReviewForm } from "../forms";

export default async function SchoolReviewPage() {
  const user = await requireRole("admin");
  const { t, locale } = await getDict();
  const [pending, reviewed] = await Promise.all([reviewQueue(user.id, "pending"), reviewQueue(user.id, "reviewed")]);
  return (
    <div className="grid gap-8">
      <section>
        <h1 className="text-2xl font-bold">{t.admin.reviewQueue}</h1>
        {pending.length === 0 ? (
          <div className="mt-4"><EmptyState title={t.admin.noPending} /></div>
        ) : (
          <ul className="mt-4 grid gap-4">
            {pending.map((a) => (
              <li key={a.id} className="card p-5" data-testid="review-item">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold">
                      {t.school.kinds[a.kind as keyof typeof t.school.kinds]} · {a.subject}
                      {a.current_value !== null && <span className="text-muted"> · {a.previous_value !== null ? `${a.previous_value} → ` : ""}{a.current_value}/10</span>}
                    </div>
                    <div className="text-xs text-muted">{a.child_name} · {a.period} · {dateFmt(a.created_at, locale, true)}</div>
                    {a.description && <p className="mt-2 text-sm text-cream/75">{a.description}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone="peach">{fmt(t.admin.suggested, { n: a.suggested_points })}</Badge>
                    {a.has_evidence && (
                      <a href={`/api/admin/evidence/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-peach underline">
                        <FileSearch className="size-4" /> {t.admin.viewEvidence}
                      </a>
                    )}
                  </div>
                </div>
                <div className="mt-4"><ReviewForm id={a.id} suggested={a.suggested_points} labels={t.admin} /></div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section>
        <h2 className="text-xl font-bold">{t.admin.reviewed}</h2>
        <ul className="mt-4 grid gap-2">
          {reviewed.map((a) => (
            <li key={a.id} className="card flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>{a.child_name} · {a.subject} · {a.period}</span>
              <span className="flex items-center gap-2">
                <Badge tone={a.status === "approved" ? "success" : "danger"}>{t.school.status[a.status]}</Badge>
                <span className="font-display font-bold text-peach">+{a.points_awarded}</span>
                {a.evidence_deleted && <span className="text-xs text-muted">{t.school.evidenceDeleted}</span>}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
