import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { tl } from "@/i18n/format";
import { listRewards, listPartners } from "@/server/rewards";
import { Badge, PointsPill } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/form";
import { RewardForm, PartnerForm } from "../forms";
import { partnerStatusAction } from "../actions";

export default async function RewardsAdminPage() {
  const user = await requireRole("admin");
  const { t, locale } = await getDict();
  const [rewards, partners] = await Promise.all([listRewards(user.id, true), listPartners(user.id)]);
  const pOpts = partners.map((p) => ({ id: p.id, name: p.name }));
  const labels = { ...t.admin, save: t.common.save };
  return (
    <div className="grid gap-8">
      <section className="card p-6">
        <h1 className="text-2xl font-bold">{t.admin.newReward}</h1>
        <div className="mt-4"><RewardForm partners={pOpts} labels={labels} /></div>
      </section>
      <section>
        <h2 className="text-xl font-bold">{t.admin.rewardsTitle}</h2>
        <ul className="mt-4 grid gap-3">
          {rewards.map((r) => (
            <li key={r.id} className="card p-4">
              <details>
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{tl(r.title, locale)} <span className="font-mono text-xs text-muted">{r.slug}</span></span>
                  <span className="flex items-center gap-2">
                    {!r.is_active && <Badge tone="danger">off</Badge>}
                    {r.partner_name && <Badge tone={r.partner_is_concept ? "demo" : "neutral"}>{r.partner_name}</Badge>}
                    {r.stock !== null && <Badge>stock {r.stock}</Badge>}
                    <PointsPill value={r.cost_points} size="sm" />
                    <span className="text-xs text-peach">{t.admin.edit}</span>
                  </span>
                </summary>
                <div className="mt-4">
                  <RewardForm
                    partners={pOpts}
                    labels={labels}
                    defaults={{
                      id: r.id, slug: r.slug, partnerId: r.partner_id, titleRu: r.title.ru ?? "", titleEn: r.title.en ?? "",
                      descriptionRu: r.description.ru ?? "", descriptionEn: r.description.en ?? "", category: r.category,
                      costPoints: r.cost_points, stock: r.stock, perUserLimit: r.per_user_limit,
                      validUntil: r.valid_until ? new Date(r.valid_until).toISOString().slice(0, 10) : "", couponTtlDays: r.coupon_ttl_days, isActive: r.is_active,
                    }}
                  />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-6">
        <h2 className="text-xl font-bold">{t.admin.partnersTitle}</h2>
        <ul className="mt-4 grid gap-2">
          {partners.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-4 py-2 text-sm">
              <span>{p.name} {p.is_concept && <Badge tone="demo">{t.common.concept}</Badge>} <Badge>{p.status}</Badge></span>
              <ActionButton action={partnerStatusAction} fields={{ id: p.id, status: p.status === "active" ? "paused" : "active" }} size="sm" variant="ghost">
                {p.status === "active" ? t.admin.pause : t.admin.activateP}
              </ActionButton>
            </li>
          ))}
        </ul>
        <h3 className="mt-6 font-sans text-sm font-semibold">{t.admin.newPartner}</h3>
        <div className="mt-3"><PartnerForm labels={labels} /></div>
      </section>
    </div>
  );
}
