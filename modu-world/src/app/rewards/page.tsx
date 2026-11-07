import Link from "next/link";
import { Gift, Sparkles, Shirt, Store, Handshake } from "lucide-react";
import { getDict, fmt } from "@/i18n";
import { tl, dateFmt } from "@/i18n/format";
import { getSessionUser } from "@/lib/auth";
import { listRewards, listPartners } from "@/server/rewards";
import { accountsFor } from "@/server/points";
import { PageHero } from "@/components/page-hero";
import { Badge, EmptyState, PointsPill } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { RedeemForm } from "./redeem-form";
import { TiltCard } from "@/components/fx/fx";
import { Reveal } from "@/components/home/reveal";

export const metadata = { title: "Rewards" };
export const dynamic = "force-dynamic";

const CAT_ICON = { merch: Shirt, toys: Gift, partner: Store, digital: Sparkles } as const;

export default async function RewardsPage({ searchParams }: { searchParams: Promise<{ cat?: string }> }) {
  const { cat } = await searchParams;
  const [{ t, locale }, user] = await Promise.all([getDict(), getSessionUser()]);
  const [rewards, partners, accounts] = await Promise.all([
    listRewards(user?.id ?? null),
    listPartners(user?.id ?? null),
    user ? accountsFor(user.id) : Promise.resolve([]),
  ]);
  const r = t.rewards;
  const cats = Object.keys(r.categories) as (keyof typeof r.categories)[];
  const shown = cat && cats.includes(cat as never) ? rewards.filter((x) => x.category === cat) : rewards;

  return (
    <>
      <PageHero eyebrow={r.eyebrow} title={r.title} text={r.text}>
        {user && accounts.length > 0 && (
          <div className="mt-6 flex flex-wrap gap-3">
            {accounts.map((a) => (
              <div key={a.id} className="card flex items-center gap-3 px-4 py-2">
                <span className="text-sm text-cream/70">{a.display_name}</span>
                <PointsPill value={a.balance} size="sm" />
              </div>
            ))}
          </div>
        )}
      </PageHero>

      <div className="container-x">
        <nav aria-label="Categories" className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none]">
          {[["", t.common.all] as const, ...cats.map((c) => [c, r.categories[c]] as const)].map(([key, label]) => (
            <Link
              key={key}
              href={key ? `/rewards?cat=${key}` : "/rewards"}
              aria-current={(cat ?? "") === key ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition",
                (cat ?? "") === key ? "border-peach bg-peach text-ink" : "border-line text-cream/75 hover:border-peach/50",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        {shown.length === 0 ? (
          <div className="mt-6">
            <EmptyState title={r.empty} />
          </div>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((rw, idx) => {
              const Icon = CAT_ICON[rw.category as keyof typeof CAT_ICON] ?? Gift;
              return (
                <Reveal key={rw.id} delay={(idx % 3) * 0.08}>
                <TiltCard max={6} className="h-full rounded-[var(--radius-card)]">
                <article className="card group flex h-full flex-col p-6" data-testid="reward" data-slug={rw.slug}>
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl bg-peach/10 text-peach transition-transform duration-500 group-hover:rotate-12">
                      <Icon className="size-6 animate-float" />
                    </span>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {rw.partner_is_concept && <Badge tone="demo">{r.conceptNote}</Badge>}
                      {rw.is_demo && !rw.partner_is_concept && <Badge tone="neutral">{t.common.demo}</Badge>}
                    </div>
                  </div>
                  <h2 className="mt-5 font-display text-lg font-bold leading-snug">{tl(rw.title, locale)}</h2>
                  {rw.partner_name && <p className="text-xs text-muted">{rw.partner_name}</p>}
                  <p className="mt-2 text-sm text-cream/65">{tl(rw.description, locale)}</p>
                  <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
                    {rw.stock !== null && <span>{fmt(r.stockLeft, { n: rw.stock })}</span>}
                    {rw.per_user_limit !== null && <span>{fmt(r.limit, { n: rw.per_user_limit })}</span>}
                    {rw.valid_until && <span>{fmt(r.until, { date: dateFmt(rw.valid_until, locale) })}</span>}
                  </div>
                  <div className="mt-auto flex items-end justify-between gap-3 pt-6">
                    <PointsPill value={rw.cost_points} />
                    <div className="min-w-[140px]">
                      {user ? (
                        rw.stock === 0 ? (
                          <Badge>{t.errors.OUT_OF_STOCK}</Badge>
                        ) : (
                          <RedeemForm
                            rewardId={rw.id}
                            cost={rw.cost_points}
                            accounts={accounts.map((a) => ({ id: a.id, name: a.display_name, balance: a.balance }))}
                            labels={{ from: r.redeemFrom, redeem: r.redeem, notEnough: r.notEnough, hint: r.couponHint }}
                          />
                        )
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link href="/login?next=/rewards">{t.nav.login}</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </article>
                </TiltCard>
                </Reveal>
              );
            })}
          </div>
        )}

        <section className="mt-16" aria-labelledby="partners">
          <h2 id="partners" className="text-2xl font-bold">{r.partners}</h2>
          <div className="mt-6 grid gap-5 md:grid-cols-2">
            {partners.map((p) => (
              <div key={p.id} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="font-display text-xl font-bold">{p.name}</span>
                  {p.is_concept && <Badge tone="demo">{r.conceptNote}</Badge>}
                </div>
                <p className="mt-3 text-sm text-cream/70">{tl(p.description, locale)}</p>
                {p.is_concept && <p className="mt-3 text-xs font-semibold text-gold">⚠ {tl(p.disclaimer, locale) || r.conceptNote}</p>}
              </div>
            ))}
            <div className="card flex flex-col justify-between border-dashed p-6">
              <div>
                <Handshake className="size-7 text-peach" />
                <h3 className="mt-4 font-display text-xl font-bold">{r.becomePartner}</h3>
                <p className="mt-2 text-sm text-cream/70">{r.becomePartnerText}</p>
              </div>
              <Button asChild variant="outline" className="mt-6 self-start">
                <Link href="/belarus#partners">{t.belarus.contact}</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
