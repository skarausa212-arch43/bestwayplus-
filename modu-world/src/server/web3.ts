import "server-only";
import { createPublicClient, createWalletClient, http, verifyMessage, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, hardhat, baseSepolia } from "viem/chains";
import { callFn, withUser } from "@/lib/db";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";
import { moduCertificateAbi } from "@/lib/web3/abi";

export const SUPPORTED_CHAINS = { [sepolia.id]: sepolia, [baseSepolia.id]: baseSepolia, [hardhat.id]: hardhat } as const;

/** Public, non-secret chain configuration passed to the client. */
export function publicChainConfig() {
  const e = env();
  return {
    chainId: e.WEB3_CHAIN_ID,
    tokenAddress: e.MODU_TOKEN_ADDRESS ?? null,
    certificateAddress: e.MODU_CERTIFICATE_ADDRESS ?? null,
    rpcUrl: e.WEB3_RPC_URL ?? null,
  };
}

export function walletLinkMessage(nonce: string, chainId: number) {
  return [
    "MODU WORLD — link this wallet to my collector account.",
    "",
    "Testnet only. This signature does not move funds or approve any transaction.",
    `Domain: ${new URL(env().APP_URL).host}`,
    `Chain ID: ${chainId}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

export async function createWalletNonce(userId: string) {
  const nonce = randomToken(18);
  const res = await callFn(userId, "wallet_nonce_create", [nonce]);
  if (!res.ok) return res;
  return { ok: true as const, nonce, message: walletLinkMessage(nonce, env().WEB3_CHAIN_ID) };
}

/** Verifies the signature server-side, then consumes the nonce atomically (replay-safe). */
export async function linkWallet(userId: string, address: string, nonce: string, signature: `0x${string}`, chainId: number) {
  if (chainId !== env().WEB3_CHAIN_ID) return { ok: false as const, error: "WRONG_CHAIN" };
  const valid = await verifyMessage({
    address: getAddress(address),
    message: walletLinkMessage(nonce, chainId),
    signature,
  }).catch(() => false);
  if (!valid) return { ok: false as const, error: "BAD_SIGNATURE" };
  return callFn(userId, "wallet_link", [nonce, address.toLowerCase(), chainId]);
}

export async function myWallets(userId: string) {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      "select id, address, chain_id, verified_at from blockchain_links where user_id = app.uid() order by verified_at desc",
    );
    return rows as { id: string; address: string; chain_id: number; verified_at: string }[];
  });
}

export async function unlinkWallet(userId: string, id: string) {
  return withUser(userId, async (db) => {
    const r = await db.query("delete from blockchain_links where id = $1 and user_id = app.uid()", [id]);
    if (r.rowCount) await db.query("select app.audit('wallet.unlink', 'blockchain_link', $1)", [id]);
    return { ok: !!r.rowCount };
  });
}

export type Certificate = {
  id: string;
  status: string;
  token_id: string;
  tx_hash: string | null;
  contract_address: string | null;
  chain_id: number | null;
  metadata: { name: string; serial: string; character: string; rarity: string; image: string; series: string };
  serial_number: string;
  public_token: string;
};

export async function myCertificates(userId: string): Promise<Certificate[]> {
  return withUser(userId, async (db) => {
    const { rows } = await db.query(
      `select d.id, d.status, d.token_id::text, d.tx_hash, d.contract_address, d.chain_id, d.metadata, t.serial_number, n.public_token
         from digital_collectibles d join toy_instances t on t.id = d.toy_instance_id
         join nfc_tags n on n.toy_instance_id = t.id
        where d.owner_user_id = app.uid() order by d.created_at desc`,
    );
    return rows;
  });
}

export function minterConfigured() {
  const e = env();
  return !!(e.CERTIFICATE_MINTER_PRIVATE_KEY && e.MODU_CERTIFICATE_ADDRESS && e.WEB3_RPC_URL);
}

/**
 * Creates the certificate record and, if a testnet minter key is configured on the server,
 * mints the ERC-721 to the collector's verified wallet. The key never reaches the browser.
 */
export async function requestCertificate(userId: string, toyId: string) {
  const res = await callFn<{ collectible_id: string; existing: boolean }>(userId, "request_certificate", [toyId]);
  if (!res.ok) return res;
  if (!minterConfigured()) return { ok: true as const, minted: false, reason: "MINTER_NOT_CONFIGURED" };

  const e = env();
  const [wallet] = await myWallets(userId);
  if (!wallet) return { ok: true as const, minted: false, reason: "NO_WALLET" };
  const cert = (await myCertificates(userId)).find((c) => c.id === res.collectible_id);
  if (!cert || cert.status === "minted") return { ok: true as const, minted: cert?.status === "minted" };

  const chain = SUPPORTED_CHAINS[e.WEB3_CHAIN_ID as keyof typeof SUPPORTED_CHAINS] ?? sepolia;
  const account = privateKeyToAccount(e.CERTIFICATE_MINTER_PRIVATE_KEY as `0x${string}`);
  const transport = http(e.WEB3_RPC_URL);
  const walletClient = createWalletClient({ account, chain, transport });
  const publicClient = createPublicClient({ chain, transport });
  try {
    const hash = await walletClient.writeContract({
      address: e.MODU_CERTIFICATE_ADDRESS as `0x${string}`,
      abi: moduCertificateAbi,
      functionName: "safeMint",
      args: [getAddress(wallet.address), BigInt(cert.token_id), cert.serial_number],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 60_000 });
    if (receipt.status !== "success") return { ok: false as const, error: "MINT_FAILED" };
    await callFn(userId, "mark_certificate_minted", [cert.id, chain.id, e.MODU_CERTIFICATE_ADDRESS, hash]);
    return { ok: true as const, minted: true, txHash: hash };
  } catch (err) {
    console.error("mint failed", err);
    return { ok: false as const, error: "MINT_FAILED" };
  }
}

/** Public ERC-721 metadata (no personal data, no grades). */
export async function certificateMetadata(tokenId: string) {
  if (!/^\d{1,20}$/.test(tokenId)) return null;
  return withUser(null, async (db) => {
    const { rows } = await db.query("select app.certificate_metadata($1::numeric) as m", [tokenId]);
    return rows[0]?.m ?? null;
  });
}
