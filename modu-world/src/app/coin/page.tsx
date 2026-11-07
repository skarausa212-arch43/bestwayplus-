import Image from "next/image";
import { AlertTriangle, Users, Vote, Award } from "lucide-react";
import { getSessionUser } from "@/lib/auth";
import { getDict } from "@/i18n";
import { myWallets, publicChainConfig } from "@/server/web3";
import { PageHero } from "@/components/page-hero";
import { Notice, Badge } from "@/components/ui/misc";
import { Web3Provider } from "@/components/web3/provider";
import { WalletPanel } from "@/components/web3/wallet-panel";
import { ChainData } from "@/components/web3/chain-data";
import { AdultGate } from "@/components/web3/adult-gate";

export const metadata = { title: "MODU Coin (testnet)" };
export const dynamic = "force-dynamic";

const ICONS = [Users, Vote, Award];

export default async function CoinPage() {
  const [{ t }, user] = await Promise.all([getDict(), getSessionUser()]);
  const c = t.coin;
  const chain = publicChainConfig();
  const allowed = !!user?.roles.includes("collector") && user.adult;
  const wallets = allowed ? await myWallets(user!.id) : [];

  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} text={c.text} />
      <div className="container-x grid gap-8 lg:grid-cols-[1fr_1.1fr]">
        <div className="grid h-fit gap-6">
          <div className="card flex items-center gap-6 p-6">
            <div className="relative [perspective:600px]">
              <div className="absolute inset-2 rounded-full bg-gold/40 blur-xl animate-pulse" />
              <Image src="/assets/modu/coin.svg" alt="MODU Coin" width={96} height={96} className="relative animate-coin [transform-style:preserve-3d]" />
            </div>
            <div>
              <div className="font-display text-2xl font-bold">MODU</div>
              <Badge tone="gold">ERC-20 · testnet</Badge>
            </div>
          </div>
          <div className="rounded-[var(--radius-card)] border border-gold/40 bg-gold/5 p-6">
            <h2 className="flex items-center gap-2 font-sans text-lg font-bold text-gold">
              <AlertTriangle className="size-5" /> {c.disclaimerTitle}
            </h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-cream/80">
              {c.disclaimer.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="text-lg font-bold">{c.tokenTitle}</h2>
            <table className="mt-3 w-full text-sm">
              <tbody>
                {c.tokenRows.map(([k, v]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="py-2.5 text-muted">{k}</td>
                    <td className="py-2.5 text-right font-semibold">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="grid h-fit gap-6">
          <div className="card p-6">
            <h2 className="text-lg font-bold">{c.utilityTitle}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {c.utility.map((u, i) => {
                const Icon = ICONS[i];
                return (
                  <div key={u.title} className="rounded-2xl border border-line p-4">
                    <Icon className="size-5 text-gold" />
                    <div className="mt-3 text-sm font-semibold">{u.title}</div>
                    <div className="mt-1 text-xs text-cream/60">{u.text}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {!allowed ? (
            <AdultGate user={user} t={t} next="/coin" />
          ) : (
            <Web3Provider config={chain}>
              <WalletPanel chainId={chain.chainId} labels={t.wallet} linked={wallets.map((w) => w.address)} />
              <div className="card p-6">
                <h2 className="mb-4 text-lg font-bold">{c.balanceTitle}</h2>
                {!chain.tokenAddress ? (
                  <Notice tone="info">{c.notDeployed}</Notice>
                ) : wallets.length === 0 ? (
                  <Notice tone="info">{t.collectors.certNoWallet}</Notice>
                ) : (
                  <div className="grid gap-6">
                    {wallets.map((w) => (
                      <ChainData
                        key={w.id}
                        address={w.address as `0x${string}`}
                        chainId={chain.chainId}
                        tokenAddress={chain.tokenAddress as `0x${string}`}
                        certificateAddress={chain.certificateAddress as `0x${string}` | null}
                        labels={c}
                      />
                    ))}
                  </div>
                )}
              </div>
            </Web3Provider>
          )}
        </div>
      </div>
    </>
  );
}
