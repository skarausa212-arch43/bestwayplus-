import Image from "next/image";
import { Gem, Award, History, Wallet, ExternalLink } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDict, fmt } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { myToys, ownershipHistory } from "@/server/toys";
import { myCertificates, myWallets, publicChainConfig } from "@/server/web3";
import { PageHero } from "@/components/page-hero";
import { Badge, EmptyState } from "@/components/ui/misc";
import { ActionButton } from "@/components/ui/form";
import { Web3Provider } from "@/components/web3/provider";
import { WalletPanel } from "@/components/web3/wallet-panel";
import { AdultGate } from "@/components/web3/adult-gate";
import { CertificateButton } from "./client";
import { unlinkWalletAction } from "./actions";

export const metadata = { title: "Collectors 18+" };
export const dynamic = "force-dynamic";

const ICONS = [Gem, Award, History, Wallet];

export default async function CollectorsPage() {
  const [{ t, locale }, user] = await Promise.all([getDict(), getSessionUser()]);
  const c = t.collectors;
  const allowed = !!user?.roles.includes("collector") && user.adult;
  const chain = publicChainConfig();

  const [toys, certs, wallets] = allowed ? await Promise.all([myToys(user!.id), myCertificates(user!.id), myWallets(user!.id)]) : [[], [], []];
  const histories = allowed ? await Promise.all(toys.map((x) => ownershipHistory(user!.id, x.id))) : [];

  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} text={c.text} />
      <section className="container-x grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {c.features.map((f, i) => {
          const Icon = ICONS[i];
          return (
            <div key={f.title} className="card p-5">
              <Icon className="size-6 text-silver" />
              <h2 className="mt-4 font-display text-base font-bold">{f.title}</h2>
              <p className="mt-2 text-sm text-cream/65">{f.text}</p>
            </div>
          );
        })}
      </section>

      <section className="container-x mt-12">
        {!allowed ? (
          <AdultGate user={user} t={t} next="/collectors" />
        ) : (
          <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <h2 className="text-2xl font-bold">{c.myCollection}</h2>
              {toys.length === 0 ? (
                <div className="mt-4">
                  <EmptyState title={c.noToys} />
                </div>
              ) : (
                <ul className="mt-4 grid gap-4">
                  {toys.map((toy, i) => {
                    const cert = certs.find((x) => x.serial_number === toy.serial_number);
                    return (
                      <li key={toy.id} className="card p-5" data-testid="collector-toy">
                        <div className="flex gap-4">
                          <div className="relative size-24 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-b from-silver/20 to-transparent">
                            <Image src={toy.image_path} alt="" fill sizes="96px" className="object-cover object-top" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-display text-lg font-bold">{toy.name}</h3>
                            <p className="font-mono text-xs text-muted">{toy.serial_number}</p>
                            {cert ? (
                              <div className="mt-3 rounded-2xl border border-gold/30 bg-gold/5 p-3 text-sm" data-testid="certificate">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-semibold text-gold">{fmt(c.certificate, { id: cert.token_id })}</span>
                                  <Badge tone={cert.status === "minted" ? "success" : "gold"}>{c.certStatus[cert.status as keyof typeof c.certStatus]}</Badge>
                                </div>
                                <div className="mt-1 text-xs text-muted">
                                  {cert.metadata.rarity} · {cert.metadata.series} · ERC-721
                                </div>
                                {cert.tx_hash && (
                                  <a className="mt-1 inline-flex items-center gap-1 text-xs text-peach" target="_blank" rel="noreferrer" href={`https://sepolia.etherscan.io/tx/${cert.tx_hash}`}>
                                    {c.viewTx} <ExternalLink className="size-3" />
                                  </a>
                                )}
                                {cert.status === "pending" && <p className="mt-2 text-xs text-cream/60">{wallets.length ? c.certPendingNote : c.certNoWallet}</p>}
                              </div>
                            ) : (
                              <div className="mt-3">
                                <CertificateButton toyId={toy.id} label={c.requestCertificate} />
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="mt-4 border-t border-line pt-3">
                          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">{c.history}</h4>
                          <ol className="mt-2 flex flex-wrap gap-2 text-xs">
                            {histories[i]?.map((h, j) => (
                              <li key={j} className="rounded-full border border-line px-3 py-1">
                                {c.events[h.event as keyof typeof c.events] ?? h.event} · {dateFmt(h.created_at, locale)}
                              </li>
                            ))}
                          </ol>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="grid h-fit gap-4">
              <Web3Provider config={chain}>
                <WalletPanel chainId={chain.chainId} labels={t.wallet} linked={wallets.map((w) => w.address)} />
              </Web3Provider>
              {wallets.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold">{t.wallet.linked}</h3>
                  <ul className="mt-3 grid gap-2">
                    {wallets.map((w) => (
                      <li key={w.id} className="flex items-center justify-between text-sm">
                        <span className="font-mono text-xs">{w.address}</span>
                        <ActionButton action={unlinkWalletAction} fields={{ id: w.id }} size="sm" variant="ghost">
                          {t.wallet.unlink}
                        </ActionButton>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
