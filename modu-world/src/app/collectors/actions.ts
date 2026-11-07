"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { walletLinkSchema } from "@/lib/validation";
import { createWalletNonce, linkWallet, unlinkWallet, requestCertificate } from "@/server/web3";
import { getDict } from "@/i18n";
import { errMsg } from "@/lib/errors";
import type { ActionState } from "@/lib/utils";

export async function walletNonceAction(): Promise<{ ok: true; nonce: string; message: string } | { ok: false; error: string }> {
  const user = await requireUser("/collectors");
  const { t } = await getDict();
  if (!(await rateLimit("wallet-nonce", 10, 600, user.id))) return { ok: false, error: errMsg(t, "RATE_LIMITED") };
  const res = await createWalletNonce(user.id);
  return res.ok ? res : { ok: false, error: errMsg(t, res.error) };
}

export async function linkWalletAction(input: { address: string; nonce: string; signature: string; chainId: number }): Promise<ActionState> {
  const user = await requireUser("/collectors");
  const { t } = await getDict();
  const parsed = walletLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const d = parsed.data;
  const res = await linkWallet(user.id, d.address, d.nonce, d.signature as `0x${string}`, d.chainId);
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  revalidatePath("/collectors");
  revalidatePath("/coin");
  return { ok: true, message: t.common.saved };
}

export async function unlinkWalletAction(fd: FormData) {
  const user = await requireUser("/collectors");
  await unlinkWallet(user.id, z.string().uuid().parse(fd.get("id")));
  revalidatePath("/collectors");
  revalidatePath("/coin");
}

export async function requestCertificateAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireUser("/collectors");
  const { t } = await getDict();
  const toyId = z.string().uuid().safeParse(fd.get("toyId"));
  if (!toyId.success) return { ok: false, error: errMsg(t, "INVALID_INPUT") };
  const res = await requestCertificate(user.id, toyId.data);
  revalidatePath("/collectors");
  if (!res.ok) return { ok: false, error: errMsg(t, res.error) };
  if ("minted" in res && res.minted) return { ok: true, message: t.collectors.certStatus.minted };
  const reason = "reason" in res ? res.reason : undefined;
  return { ok: true, message: reason === "NO_WALLET" ? t.collectors.certNoWallet : t.collectors.certPendingNote };
}
