import Image from "next/image";
import Link from "next/link";
import { Settings, Nfc, Gift, Ticket, Users, History, X } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { getDict, fmt } from "@/i18n";
import { dateFmt, tl } from "@/i18n/format";
import { myToys } from "@/server/toys";
import { accountsFor, history } from "@/server/points";
import { listChildren } from "@/server/users";
import { listCharacters } from "@/server/catalog";
import { listRewards, myRedemptions } from "@/server/rewards";
import { Badge, EmptyState, Notice, PointsPill } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ActionButton } from "@/components/ui/form";
import { TransferButton, AddChildForm } from "./client";
import { CountUp, TiltCard } from "@/components/fx/fx";
import { Reveal } from "@/components/home/reveal";
import { cancelTransferAction, assignChildAction, removeChildAction } from "./actions";

export const metadata = { title: "My MODU" };
export const dynamic = "force-dynamic";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser("/dashboard");
  const { denied } = await searchParams;
  const { t, locale } = await getDict();
  const [toys, accounts, children, characters, rewards, redemptions, tx] = await Promise.all([
    myToys(user.id),
    accountsFor(user.id),
    listChildren(user.id),
    listCharacters(),
    listRewards(user.id),
    myRedemptions(user.id),
    history(user.id, undefined, 15),
  ]);
  const d = t.dashboard;
  const ownedSlugs = new Set(toys.map((x) => x.slug));
  const progress = characters.filter((c) => ownedSlugs.has(c.slug)).length;
  const maxBalance = Math.max(0, ...accounts.map((a) => a.balance));
  const affordable = rewards.filter((r) => r.cost_points <= Math.max(maxBalance, 1)).slice(0, 3);
  const isParent = user.roles.includes("parent");

  return (
    <div className="container-x pb-10 pt-8">
      {denied && <Notice tone="warning" className="mb-6">{fmt(d.denied, { role: denied })}</Notice>}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{d.title}</p>
          <h1 className="mt-2 text-3xl font-extrabold sm:text-4xl">{fmt(d.hello, { name: user.displayName })}</h1>
          {user.isDemo && <Badge tone="demo" className="mt-3">{t.common.demoData}</Badge>}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/settings">
              <Settings /> {d.settings}
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/activate">
              <Nfc /> {t.nav.activate}
            </Link>
          </Button>
        </div>
      </div>

      {/* Balances */}
      <section aria-labelledby="bal" className="mt-8">
        <h2 id="bal" className="sr-only">{d.balances}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {accounts.map((a, i) => (
            <Reveal key={a.id} delay={i * 0.06}>
            <TiltCard max={6} className="h-full rounded-[var(--radius-card)]">
            <div className={a.is_child ? "card h-full p-5" : "h-full rounded-[var(--radius-card)] border-flow p-5"}>
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t.common.pointsName}</span>
                <Badge tone={a.is_child ? "peach" : "neutral"}>{a.is_child ? d.child : d.you}</Badge>
              </div>
              <div className="mt-1 truncate font-semibold">{a.display_name}</div>
              <div className="mt-3">
                <PointsPill value={<CountUp value={a.balance} />} size="lg" />
              </div>
            </div>
            </TiltCard>
            </Reveal>
          ))}
          <div className="card p-5">
            <div className="text-xs text-muted">{d.progress}</div>
            <div className="mt-2 font-display text-3xl font-bold">
              {progress}/{characters.length}
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={characters.length}>
              <div className="h-full origin-left rounded-full bg-gradient-to-r from-peach via-gold to-peach bg-[length:200%_100%] animate-shimmer transition-[width] duration-1000" style={{ width: `${(progress / Math.max(1, characters.length)) * 100}%` }} />
            </div>
            <div className="mt-2 text-xs text-muted">{fmt(d.progressText, { owned: progress, total: characters.length })}</div>
          </div>
        </div>
      </section>

      {/* Toys */}
      <section className="mt-12" aria-labelledby="toys">
        <h2 id="toys" className="text-2xl font-bold">{d.toys}</h2>
        {toys.length === 0 ? (
          <div className="mt-4">
            <EmptyState icon={<Nfc className="size-8" />} title={d.noToys}>
              <Button asChild size="sm">
                <Link href="/activate">{t.nav.activate}</Link>
              </Button>
            </EmptyState>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {toys.map((toy) => (
              <article key={toy.id} className="card flex flex-col overflow-hidden" data-testid="my-toy">
                <div className="flex gap-4 p-4">
                  <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-peach/20 to-transparent">
                    <Image src={toy.image_path} alt="" fill sizes="96px" className="object-cover object-top" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-display text-lg font-bold">{toy.name}</h3>
                    <p className="font-mono text-xs text-muted">{toy.serial_number}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Badge tone={toy.status === "transfer_pending" ? "gold" : "success"}>{t.toy.status[toy.status as keyof typeof t.toy.status]}</Badge>
                      {toy.child_name && <Badge tone="peach">{toy.child_name}</Badge>}
                      {toy.certificate_status && <Badge tone="silver">NFT · {toy.certificate_status}</Badge>}
                    </div>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-line p-4">
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/t/${toy.public_token}`}>{d.openPassport}</Link>
                  </Button>
                  {toy.status === "activated" && <TransferButton toyId={toy.id} labels={{ transfer: d.transfer, copy: t.common.copy, copied: t.common.copied }} />}
                  {toy.status === "transfer_pending" && (
                    <ActionButton action={cancelTransferAction} fields={{ toyId: toy.id }} size="sm" variant="danger">
                      <X /> {d.cancelTransfer}
                    </ActionButton>
                  )}
                  {children.length > 0 && toy.status === "activated" && (
                    <form action={assignChildAction} className="ml-auto flex items-center gap-1">
                      <input type="hidden" name="toyId" value={toy.id} />
                      <label className="sr-only" htmlFor={`as-${toy.id}`}>{d.assign}</label>
                      <select id={`as-${toy.id}`} name="childId" defaultValue={toy.assigned_child_id ?? ""} className="rounded-full border border-line bg-ink px-3 py-1.5 text-xs">
                        <option value="">{d.you}</option>
                        {children.map((c) => (
                          <option key={c.id} value={c.id}>{c.display_name}</option>
                        ))}
                      </select>
                      <Button type="submit" size="sm" variant="ghost">OK</Button>
                    </form>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="mt-12 grid gap-8 lg:grid-cols-2">
        {/* History */}
        <section aria-labelledby="hist" className="card p-6">
          <h2 id="hist" className="flex items-center gap-2 text-xl font-bold">
            <History className="size-5 text-peach" /> {d.history}
          </h2>
          {tx.length === 0 ? (
            <p className="mt-4 text-sm text-muted">{d.noHistory}</p>
          ) : (
            <ul className="mt-4 divide-y divide-line">
              {tx.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{d.kinds[x.kind as keyof typeof d.kinds] ?? x.kind}</div>
                    <div className="truncate text-xs text-muted">
                      {x.display_name} · {dateFmt(x.created_at, locale, true)}
                      {x.note ? ` · ${x.note}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 font-display font-bold ${x.amount > 0 ? "text-success" : "text-cream/70"}`}>
                    {x.amount > 0 ? "+" : ""}
                    {x.amount} MP
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid gap-8">
          {/* Rewards & coupons */}
          <section aria-labelledby="coupons" className="card p-6">
            <h2 id="coupons" className="flex items-center gap-2 text-xl font-bold">
              <Ticket className="size-5 text-peach" /> {d.myCoupons}
            </h2>
            {redemptions.length === 0 ? (
              <p className="mt-4 text-sm text-muted">{d.noCoupons}</p>
            ) : (
              <ul className="mt-4 grid gap-2">
                {redemptions.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 rounded-2xl border border-line px-4 py-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{tl(r.title, locale)}</div>
                      <div className="text-xs text-muted">
                        {r.display_name} · {fmt(d.expires, { date: dateFmt(r.expires_at, locale) })}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-bold text-peach" data-testid="coupon-code">{r.code}</div>
                      <Badge tone={r.coupon_status === "issued" ? "success" : "neutral"}>
                        {d.couponStatus[r.coupon_status as keyof typeof d.couponStatus]}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-6 border-t border-line pt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-cream/80">
                <Gift className="size-4" /> {d.rewardsAvailable}
              </h3>
              <ul className="mt-3 grid gap-2">
                {affordable.map((r) => (
                  <li key={r.id} className="flex items-center justify-between text-sm">
                    <span>{tl(r.title, locale)}</span>
                    <PointsPill value={r.cost_points} size="sm" />
                  </li>
                ))}
              </ul>
              <Button asChild size="sm" variant="outline" className="mt-4">
                <Link href="/rewards">{t.nav.rewards}</Link>
              </Button>
            </div>
          </section>

          {/* Children */}
          {isParent && (
            <section aria-labelledby="kids" className="card p-6">
              <h2 id="kids" className="flex items-center gap-2 text-xl font-bold">
                <Users className="size-5 text-peach" /> {d.children}
              </h2>
              {children.length === 0 ? (
                <p className="mt-3 text-sm text-muted">{d.noChildren}</p>
              ) : (
                <ul className="mt-3 grid gap-2">
                  {children.map((c) => (
                    <li key={c.id} className="flex items-center justify-between rounded-2xl border border-line px-4 py-2.5 text-sm">
                      <span>
                        {c.display_name} <span className="text-muted">· {c.birth_year}</span>
                      </span>
                      <ActionButton action={removeChildAction} fields={{ childId: c.id }} size="sm" variant="ghost" confirm={d.removeChildConfirm}>
                        {d.removeChild}
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-semibold text-peach">+ {d.addChild}</summary>
                <div className="mt-4">
                  <AddChildForm labels={{ childName: d.childName, birthYear: d.birthYear, consent: d.consent, add: d.addChild }} />
                </div>
              </details>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
