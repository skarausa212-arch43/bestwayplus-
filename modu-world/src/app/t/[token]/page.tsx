import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, Lock, Ban, UserRound, Info, SearchX } from "lucide-react";
import { getDict, fmt } from "@/i18n";
import { pick, dateFmt } from "@/i18n/format";
import { getSessionUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getPassport } from "@/server/toys";
import { listChildren } from "@/server/users";
import { Badge, Notice } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { rarityTone } from "@/components/character-card";
import { ActivateForm, AcceptTransferForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "MODU passport", robots: { index: false } };

export default async function TagPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [{ t, locale }, user] = await Promise.all([getDict(), getSessionUser()]);

  // Throttle scanning/enumeration per IP. Tokens are 128-bit random, so guessing is already infeasible.
  if (!(await rateLimit("tag-view", 120, 600))) {
    return (
      <div className="container-x py-20">
        <Notice tone="error">{t.errors.RATE_LIMITED}</Notice>
      </div>
    );
  }

  const p = await getPassport(token, user?.id ?? null);
  if (!p.ok) {
    return (
      <div className="container-x flex flex-col items-center py-24 text-center">
        <SearchX className="size-12 text-peach" />
        <h1 className="mt-6 text-3xl font-bold">{t.common.notFound}</h1>
        <p className="mt-3 max-w-md text-cream/70">{t.common.notFoundText}</p>
        <Button asChild className="mt-8">
          <Link href="/activate">{t.toy.scanAnother}</Link>
        </Button>
      </div>
    );
  }

  const content = pick(p.character.content, locale);
  const children = user && p.status === "in_stock" ? await listChildren(user.id) : [];
  const next = `/t/${token}`;
  const statusTone = { in_stock: "peach", activated: "success", transfer_pending: "gold", revoked: "danger" } as const;

  return (
    <div className="container-x grid gap-8 pb-10 pt-6 lg:grid-cols-[1fr_1.05fr] lg:pt-12">
      {/* Passport card */}
      <div className="card-glow relative overflow-hidden">
        <div className="relative aspect-[4/3.2] overflow-hidden bg-gradient-to-b from-peach/20 via-ink-2 to-ink-2">
          <Image src={p.character.image_path} alt={p.character.name} fill priority sizes="(max-width:1024px) 100vw, 50vw" className="object-contain object-bottom p-6" />
          <div className="absolute left-4 top-4 flex flex-wrap gap-2">
            <Badge tone={statusTone[p.status]}>{t.toy.status[p.status]}</Badge>
            {p.is_demo && <Badge tone="demo">{t.toy.demoBadge}</Badge>}
          </div>
        </div>
        <div className="p-6">
          <p className="eyebrow">{t.toy.passport}</p>
          <div className="mt-2 flex items-center gap-3">
            <h1 className="text-3xl font-extrabold">{p.character.name}</h1>
            <Badge tone={rarityTone[p.character.rarity as keyof typeof rarityTone]}>
              {t.collection.rarity[p.character.rarity as keyof typeof t.collection.rarity]}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-cream/65">{content?.tagline}</p>
          <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line text-sm">
            {[
              [t.toy.serial, <span key="s" className="font-mono">{p.serial}</span>],
              [t.toy.edition, `#${p.edition_number} ${t.toy.of} ${p.batch_quantity}`],
              [t.collection.series, `${p.character.series} · ${p.edition}`],
              [t.toy.activatedAt, dateFmt(p.activated_at, locale)],
              [t.toy.transfers, String(p.transfers)],
              [t.toy.tagType, p.tag_type.toUpperCase()],
            ].map(([k, v], i) => (
              <div key={i} className="bg-ink-2 px-4 py-3">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="mt-0.5 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-5">
        {p.status === "revoked" && (
          <Notice tone="error">
            <Ban className="mb-1 inline size-4" /> {t.toy.revokedText}
          </Notice>
        )}

        {p.status === "in_stock" && (
          <div className="card p-6 sm:p-8">
            <h2 className="text-2xl font-bold">{t.toy.activateTitle}</h2>
            <p className="mt-2 text-sm text-cream/70">{t.toy.activateText}</p>
            <div className="mt-6">
              {p.locked ? (
                <Notice tone="warning">
                  <Lock className="mb-1 inline size-4" /> {t.toy.lockedText}
                </Notice>
              ) : user ? (
                <ActivateForm
                  token={token}
                  childOptions={children.map((c) => ({ id: c.id, name: c.display_name }))}
                  labels={{
                    code: t.toy.codeLabel,
                    placeholder: t.toy.codePlaceholder,
                    button: t.toy.activateButton,
                    assignTo: t.toy.assignTo,
                    me: t.toy.assignMe,
                    dashboard: t.toy.goDashboard,
                  }}
                />
              ) : (
                <div className="grid gap-3">
                  <p className="text-sm text-cream/80">{t.toy.loginToActivate}</p>
                  <Button asChild size="lg">
                    <Link href={`/register?next=${encodeURIComponent(next)}`}>{t.nav.register}</Link>
                  </Button>
                  <Button asChild size="lg" variant="outline">
                    <Link href={`/login?next=${encodeURIComponent(next)}`}>{t.nav.login}</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        {(p.status === "activated" || p.status === "transfer_pending") && (
          <div className="card p-6 sm:p-8">
            {p.is_owner ? (
              <>
                <div className="flex items-center gap-3 text-success">
                  <ShieldCheck className="size-6" />
                  <h2 className="font-display text-xl font-bold">{t.toy.ownerYou}</h2>
                </div>
                <Button asChild className="mt-6">
                  <Link href="/dashboard">{t.toy.goDashboard}</Link>
                </Button>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <UserRound className="mt-1 size-5 text-peach" />
                <p className="text-cream/80">{p.owner_public_name ? fmt(t.toy.ownerPublic, { name: p.owner_public_name }) : t.toy.ownerPrivate}</p>
              </div>
            )}
          </div>
        )}

        {p.status === "transfer_pending" && !p.is_owner && (
          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-bold">{t.toy.transferTitle}</h2>
            <p className="mb-5 mt-2 text-sm text-cream/70">{t.toy.transferText}</p>
            {user ? (
              <AcceptTransferForm token={token} labels={{ code: t.toy.transferCode, button: t.toy.transferAccept, dashboard: t.toy.goDashboard }} />
            ) : (
              <Button asChild>
                <Link href={`/login?next=${encodeURIComponent(next)}`}>{t.nav.login}</Link>
              </Button>
            )}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-2xl border border-line px-4 py-3 text-xs leading-relaxed text-muted">
          <Info className="mt-0.5 size-4 shrink-0" /> {t.toy.securityNote}
        </div>
      </div>
    </div>
  );
}
