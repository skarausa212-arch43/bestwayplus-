"use client";

import { useState, useTransition } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage, useSwitchChain } from "wagmi";
import { Wallet, PenLine, Unplug, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice, Badge } from "@/components/ui/misc";
import { walletNonceAction, linkWalletAction } from "@/app/collectors/actions";

export type WalletLabels = {
  title: string;
  text: string;
  connect: string;
  noWallet: string;
  switchChain: string;
  sign: string;
  linked: string;
  disconnect: string;
  testnetOnly: string;
};

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Connect an injected wallet and prove ownership by signing a server nonce.
 * Nothing here can send funds: we only request a personal_sign of a plain-text message.
 */
export function WalletPanel({ chainId, labels, linked }: { chainId: number; labels: WalletLabels; linked: string[] }) {
  const { address, isConnected, chainId: current } = useAccount();
  const { connectors, connect, isPending: connecting, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: switching } = useSwitchChain();
  const { signMessageAsync } = useSignMessage();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const injectedConnector = connectors[0];
  const alreadyLinked = address && linked.includes(address.toLowerCase());

  const link = () =>
    start(async () => {
      setMsg(null);
      if (!address) return;
      const n = await walletNonceAction();
      if (!n.ok) return setMsg({ ok: false, text: n.error });
      try {
        const signature = await signMessageAsync({ message: n.message });
        const res = await linkWalletAction({ address, nonce: n.nonce, signature, chainId });
        setMsg(res?.ok ? { ok: true, text: res.message ?? "" } : { ok: false, text: res?.error ?? "" });
      } catch (e) {
        setMsg({ ok: false, text: (e as Error).message.split("\n")[0] });
      }
    });

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-xl font-bold">
          <Wallet className="size-5 text-gold" /> {labels.title}
        </h2>
        <Badge tone="gold">testnet</Badge>
      </div>
      <p className="mt-2 text-sm text-cream/70">{labels.text}</p>
      <div className="mt-5 grid gap-3">
        {!isConnected ? (
          <>
            <Button
              variant="gold"
              disabled={connecting}
              onClick={() => (injectedConnector ? connect({ connector: injectedConnector }) : setMsg({ ok: false, text: labels.noWallet }))}
            >
              {connecting ? <Loader2 className="animate-spin" /> : <Wallet />} {labels.connect}
            </Button>
            {connectError && <Notice tone="error">{labels.noWallet}</Notice>}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-2xl border border-line px-4 py-3">
              <span className="font-mono text-sm">{short(address!)}</span>
              <Button size="sm" variant="ghost" onClick={() => disconnect()}>
                <Unplug /> {labels.disconnect}
              </Button>
            </div>
            {current !== chainId ? (
              <Button variant="outline" disabled={switching} onClick={() => switchChain({ chainId })}>
                {labels.switchChain}
              </Button>
            ) : (
              !alreadyLinked && (
                <Button variant="gold" disabled={pending} onClick={link}>
                  {pending ? <Loader2 className="animate-spin" /> : <PenLine />} {labels.sign}
                </Button>
              )
            )}
          </>
        )}
        {msg && <Notice tone={msg.ok ? "success" : "error"}>{msg.text}</Notice>}
        <p className="text-xs text-muted">{labels.testnetOnly}</p>
      </div>
    </div>
  );
}
