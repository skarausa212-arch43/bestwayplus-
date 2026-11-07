"use client";

import { useActionState } from "react";
import Link from "next/link";
import { KeyRound } from "lucide-react";
import { SubmitButton, ActionMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { activateAction, acceptTransferAction } from "./actions";

export function ActivateForm({
  token,
  childOptions,
  labels,
}: {
  token: string;
  childOptions: { id: string; name: string }[];
  labels: { code: string; placeholder: string; button: string; assignTo: string; me: string; dashboard: string };
}) {
  const [state, action] = useActionState(activateAction, null);
  if (state?.ok) {
    return (
      <div className="grid gap-4">
        <ActionMessage state={state} />
        <Button asChild size="lg">
          <Link href="/dashboard">{labels.dashboard}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div>
        <label htmlFor="code" className="label">
          {labels.code}
        </label>
        <div className="relative">
          <KeyRound className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="code"
            name="code"
            required
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder={labels.placeholder}
            className="field pl-11 font-mono text-lg uppercase tracking-[0.3em]"
            maxLength={12}
          />
        </div>
      </div>
      {childOptions.length > 0 && (
        <div>
          <label htmlFor="childId" className="label">
            {labels.assignTo}
          </label>
          <select id="childId" name="childId" className="field">
            <option value="">{labels.me}</option>
            {childOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <ActionMessage state={state} />
      <SubmitButton size="lg">{labels.button}</SubmitButton>
    </form>
  );
}

export function AcceptTransferForm({ token, labels }: { token: string; labels: { code: string; button: string; dashboard: string } }) {
  const [state, action] = useActionState(acceptTransferAction, null);
  if (state?.ok) {
    return (
      <div className="grid gap-4">
        <ActionMessage state={state} />
        <Button asChild>
          <Link href="/dashboard">{labels.dashboard}</Link>
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <label htmlFor="tcode" className="label">
        {labels.code}
      </label>
      <input id="tcode" name="code" required placeholder="XXXX-XXXX-XXXX" className="field font-mono uppercase tracking-widest" maxLength={16} />
      <ActionMessage state={state} />
      <SubmitButton variant="outline">{labels.button}</SubmitButton>
    </form>
  );
}
