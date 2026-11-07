"use client";

import { useActionState, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { confetti } from "@/components/fx/confetti";
import { Ticket } from "lucide-react";
import { SubmitButton, ActionMessage } from "@/components/ui/form";
import { redeemAction } from "./actions";

export function RedeemForm({
  rewardId,
  cost,
  accounts,
  labels,
}: {
  rewardId: string;
  cost: number;
  accounts: { id: string; name: string; balance: number }[];
  labels: { from: string; redeem: string; notEnough: string; hint: string };
}) {
  const [state, action] = useActionState(redeemAction, null);
  // One key per form instance: retries of the same request are idempotent on the server.
  const [key] = useState(() => crypto.randomUUID());
  const best = [...accounts].sort((a, b) => b.balance - a.balance)[0];
  const [accountId, setAccountId] = useState(best?.id ?? "");
  const balance = accounts.find((a) => a.id === accountId)?.balance ?? 0;
  useEffect(() => {
    if (state?.ok) confetti();
  }, [state]);

  if (state?.ok) {
    return (
      <div className="grid gap-2">
        <motion.div
          initial={{ scale: 0.6, opacity: 0, rotateX: 90 }}
          animate={{ scale: 1, opacity: 1, rotateX: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="flex items-center gap-2 rounded-2xl border border-success/40 bg-success/10 px-4 py-3"
        >
          <Ticket className="size-5 text-success" />
          <span className="font-mono text-lg font-bold text-success" data-testid="new-coupon">{String(state.data?.code)}</span>
        </motion.div>
        <p className="text-xs text-muted">{labels.hint}</p>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="rewardId" value={rewardId} />
      <input type="hidden" name="idempotencyKey" value={key} />
      {accounts.length > 1 && (
        <select
          name="accountId"
          aria-label={labels.from}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="rounded-full border border-line bg-ink px-3 py-2 text-xs"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.balance} MP
            </option>
          ))}
        </select>
      )}
      {accounts.length === 1 && <input type="hidden" name="accountId" value={accountId} />}
      <SubmitButton size="sm" disabled={balance < cost}>
        {balance < cost ? labels.notEnough.replace("{n}", String(cost - balance)) : labels.redeem}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
