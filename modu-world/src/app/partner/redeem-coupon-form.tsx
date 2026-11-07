"use client";

import { useActionState } from "react";
import { SubmitButton, ActionMessage } from "@/components/ui/form";
import { redeemCouponAction } from "./actions";

export function CouponRedeemForm({ labels }: { labels: { code: string; redeem: string } }) {
  const [state, action] = useActionState(redeemCouponAction, null);
  return (
    <form action={action} className="grid gap-3">
      <label htmlFor="coupon" className="label">{labels.code}</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input id="coupon" name="code" required placeholder="MODU-XXXX-XXXX" autoComplete="off" className="field font-mono uppercase tracking-widest" />
        <SubmitButton>{labels.redeem}</SubmitButton>
      </div>
      <ActionMessage state={state} />
    </form>
  );
}
