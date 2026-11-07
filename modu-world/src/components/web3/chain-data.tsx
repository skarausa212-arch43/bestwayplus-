"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContract } from "wagmi";
import { formatUnits, parseAbiItem, type Address } from "viem";
import { ExternalLink, Loader2 } from "lucide-react";
import { moduTokenAbi, moduCertificateAbi } from "@/lib/web3/abi";
import { Notice } from "@/components/ui/misc";

type Labels = { balance: string; certificates: string; txs: string; noTxs: string; contract: string; rpcError: string };
type Tx = { hash: string; from: string; to: string; value: string; block: bigint };

const explorer = (chainId: number) => (chainId === 84532 ? "https://sepolia.basescan.org" : "https://sepolia.etherscan.io");

/** Reads real testnet state (no mocked balances): token balance, certificate count and recent Transfer events. */
export function ChainData({
  address,
  chainId,
  tokenAddress,
  certificateAddress,
  labels,
}: {
  address: Address;
  chainId: number;
  tokenAddress: Address;
  certificateAddress: Address | null;
  labels: Labels;
}) {
  const client = usePublicClient();
  const balance = useReadContract({ address: tokenAddress, abi: moduTokenAbi, functionName: "balanceOf", args: [address] });
  const certs = useReadContract({
    address: certificateAddress ?? undefined,
    abi: moduCertificateAbi,
    functionName: "balanceOf",
    args: [address],
    query: { enabled: !!certificateAddress },
  });
  const [txs, setTxs] = useState<Tx[] | null>(null);
  const [txError, setTxError] = useState(false);

  useEffect(() => {
    if (!client) return;
    let cancelled = false;
    (async () => {
      try {
        const latest = await client.getBlockNumber();
        const fromBlock = latest > 9000n ? latest - 9000n : 0n;
        const event = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
        const [outgoing, incoming] = await Promise.all([
          client.getLogs({ address: tokenAddress, event, args: { from: address }, fromBlock, toBlock: latest }),
          client.getLogs({ address: tokenAddress, event, args: { to: address }, fromBlock, toBlock: latest }),
        ]);
        if (cancelled) return;
        setTxs(
          [...outgoing, ...incoming]
            .sort((a, b) => Number((b.blockNumber ?? 0n) - (a.blockNumber ?? 0n)))
            .slice(0, 10)
            .map((l) => ({
              hash: l.transactionHash ?? "",
              from: l.args.from ?? "",
              to: l.args.to ?? "",
              value: formatUnits(l.args.value ?? 0n, 18),
              block: l.blockNumber ?? 0n,
            })),
        );
      } catch {
        if (!cancelled) setTxError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [client, address, tokenAddress]);

  if (balance.isError) return <Notice tone="error">{labels.rpcError}</Notice>;

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">{labels.balance}</div>
          <div className="mt-1 font-display text-2xl font-bold text-gold" data-testid="token-balance">
            {balance.isLoading ? <Loader2 className="size-5 animate-spin" /> : Number(formatUnits(balance.data ?? 0n, 18)).toLocaleString()}
          </div>
        </div>
        <div className="rounded-2xl border border-line p-4">
          <div className="text-xs text-muted">{labels.certificates}</div>
          <div className="mt-1 font-display text-2xl font-bold">{certificateAddress ? (certs.data?.toString() ?? "…") : "—"}</div>
        </div>
      </div>
      <div>
        <h3 className="text-sm font-semibold text-cream/80">{labels.txs}</h3>
        {txError ? (
          <p className="mt-2 text-xs text-danger">{labels.rpcError}</p>
        ) : txs === null ? (
          <Loader2 className="mt-2 size-4 animate-spin text-muted" />
        ) : txs.length === 0 ? (
          <p className="mt-2 text-xs text-muted">{labels.noTxs}</p>
        ) : (
          <ul className="mt-2 grid gap-1 text-xs">
            {txs.map((x) => (
              <li key={x.hash + x.to} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
                <span className={x.to.toLowerCase() === address.toLowerCase() ? "text-success" : "text-cream/70"}>
                  {x.to.toLowerCase() === address.toLowerCase() ? "+" : "−"}
                  {x.value} MODU
                </span>
                <a href={`${explorer(chainId)}/tx/${x.hash}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-peach">
                  {x.hash.slice(0, 10)}… <ExternalLink className="size-3" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
      <a href={`${explorer(chainId)}/address/${tokenAddress}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-muted hover:text-peach">
        {labels.contract}: <span className="font-mono">{tokenAddress}</span> <ExternalLink className="size-3" />
      </a>
    </div>
  );
}
