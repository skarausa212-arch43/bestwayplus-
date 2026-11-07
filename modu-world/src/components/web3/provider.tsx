"use client";

import { useState } from "react";
import { WagmiProvider, createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { sepolia, baseSepolia, hardhat } from "wagmi/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export type ChainConfig = { chainId: number; tokenAddress: string | null; certificateAddress: string | null; rpcUrl: string | null };

const CHAINS = { [sepolia.id]: sepolia, [baseSepolia.id]: baseSepolia, [hardhat.id]: hardhat } as const;

export function chainFor(id: number) {
  return CHAINS[id as keyof typeof CHAINS] ?? sepolia;
}

/** Wagmi is mounted only on the adult Web3 pages, never in the children's part of the app. */
export function Web3Provider({ config, children }: { config: ChainConfig; children: React.ReactNode }) {
  const [state] = useState(() => {
    const chain = chainFor(config.chainId);
    return {
      wagmi: createConfig({
        chains: [chain],
        connectors: [injected()],
        transports: { [chain.id]: http(config.rpcUrl ?? undefined) } as never,
        ssr: true,
      }),
      query: new QueryClient(),
    };
  });
  return (
    <WagmiProvider config={state.wagmi}>
      <QueryClientProvider client={state.query}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
