import Link from "next/link";
import { Nfc, Smartphone } from "lucide-react";
import { getDict } from "@/i18n";
import { withUser } from "@/lib/db";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/misc";
import { TokenLinkForm } from "./token-link-form";

export const metadata = { title: "Activate" };
export const dynamic = "force-dynamic";

export default async function ActivatePage() {
  const { t } = await getDict();
  const demo =
    process.env.DEMO_MODE === "false"
      ? []
      : await withUser(null, async (db) => (await db.query("select * from app.demo_tags()")).rows as { serial: string; public_token: string; status: string; character_name: string }[]);

  return (
    <>
      <PageHero eyebrow="NFC" title={t.activate.title} text={t.activate.text} />
      <div className="container-x grid gap-6 lg:grid-cols-2">
        <div className="card relative overflow-hidden p-6 sm:p-8">
          <div className="absolute right-6 top-6 grid size-20 place-items-center rounded-3xl bg-peach/10 text-peach">
            <span className="absolute inset-0 rounded-3xl border border-peach/50 animate-pulse-ring" />
            <Nfc className="size-9" />
          </div>
          <Smartphone className="size-8 text-cream/60" />
          <ol className="mt-6 space-y-4">
            {t.activate.steps.map((s, i) => (
              <li key={s} className="flex gap-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-peach font-display text-sm font-bold text-ink">{i + 1}</span>
                <span className="pt-1 text-cream/85">{s}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="card p-6 sm:p-8">
          <TokenLinkForm labels={{ label: t.activate.linkLabel, placeholder: t.activate.linkPlaceholder, open: t.activate.open, invalid: t.activate.invalidLink }} />
          {demo.length > 0 && (
            <div className="mt-8 border-t border-line pt-6">
              <div className="flex items-center gap-2">
                <Badge tone="demo">{t.common.demo}</Badge>
                <h2 className="font-sans text-sm font-semibold">{t.activate.demoTitle}</h2>
              </div>
              <p className="mt-1 text-xs text-muted">{t.activate.demoText}</p>
              <ul className="mt-4 grid gap-2">
                {demo.map((d) => (
                  <li key={d.public_token}>
                    <Link
                      href={`/t/${d.public_token}`}
                      className="flex items-center justify-between rounded-2xl border border-line px-4 py-3 text-sm hover:border-peach/50"
                    >
                      <span>
                        <span className="font-mono">{d.serial}</span> <span className="text-muted">· {d.character_name}</span>
                      </span>
                      <Badge tone={d.status === "in_stock" ? "peach" : "neutral"}>{t.toy.status[d.status as keyof typeof t.toy.status]}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
