"use client";

import { useActionState, useState } from "react";
import { Copy, Check, Send } from "lucide-react";
import { SubmitButton, ActionMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { startTransferAction, addChildAction, updateProfileAction, attestAdultAction, deleteAccountAction } from "./actions";

export function CopyButton({ value, labels }: { value: string; labels: { copy: string; copied: string } }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard?.writeText(value).catch(() => {});
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? <Check /> : <Copy />} {done ? labels.copied : labels.copy}
    </Button>
  );
}

export function TransferButton({ toyId, labels }: { toyId: string; labels: { transfer: string; copy: string; copied: string } }) {
  const [state, action] = useActionState(startTransferAction, null);
  if (state?.ok) {
    return (
      <div className="grid gap-2">
        <ActionMessage state={state} />
        <CopyButton value={String(state.data?.code)} labels={labels} />
      </div>
    );
  }
  return (
    <form action={action}>
      <input type="hidden" name="toyId" value={toyId} />
      <SubmitButton size="sm" variant="outline">
        <Send /> {labels.transfer}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}

export function AddChildForm({ labels }: { labels: { childName: string; birthYear: string; consent: string; add: string } }) {
  const [state, action] = useActionState(addChildAction, null);
  const year = new Date().getFullYear();
  return (
    <form action={action} className="grid gap-3" key={state?.ok ? Date.now() : "form"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="childName">
            {labels.childName}
          </label>
          <input id="childName" name="displayName" required minLength={2} maxLength={30} className="field" />
        </div>
        <div>
          <label className="label" htmlFor="birthYear">
            {labels.birthYear}
          </label>
          <select id="birthYear" name="birthYear" className="field" defaultValue={year - 10}>
            {Array.from({ length: 16 }, (_, i) => year - 3 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-start gap-3 text-xs leading-relaxed text-cream/75">
        <input type="checkbox" name="consent" required className="mt-0.5 size-4 shrink-0 accent-[#f4b58d]" />
        {labels.consent}
      </label>
      <ActionMessage state={state} />
      <SubmitButton size="sm">{labels.add}</SubmitButton>
    </form>
  );
}

export function ProfileForm({
  defaults,
  labels,
}: {
  defaults: { displayName: string; locale: string; publicCollection: boolean };
  labels: Record<string, string>;
}) {
  const [state, action] = useActionState(updateProfileAction, null);
  return (
    <form action={action} className="grid gap-4">
      <div>
        <label className="label" htmlFor="dn">
          {labels.displayName}
        </label>
        <input id="dn" name="displayName" defaultValue={defaults.displayName} required className="field" />
      </div>
      <div>
        <label className="label" htmlFor="loc">
          {labels.locale}
        </label>
        <select id="loc" name="locale" defaultValue={defaults.locale} className="field">
          <option value="ru">Русский</option>
          <option value="en">English</option>
          <option value="be">Беларуская (β)</option>
          <option value="pl">Polski (β)</option>
        </select>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <input type="checkbox" name="publicCollection" defaultChecked={defaults.publicCollection} className="size-4 accent-[#f4b58d]" />
        {labels.publicCollection}
      </label>
      <ActionMessage state={state} />
      <SubmitButton>{labels.save}</SubmitButton>
    </form>
  );
}

export function AdultForm({ labels }: { labels: Record<string, string> }) {
  const [state, action] = useActionState(attestAdultAction, null);
  return (
    <form action={action} className="grid gap-3">
      <label className="label" htmlFor="bd">
        {labels.birthDate}
      </label>
      <input id="bd" type="date" name="birthDate" required className="field" max={new Date().toISOString().slice(0, 10)} />
      <ActionMessage state={state} />
      <SubmitButton variant="light">{labels.adultConfirm}</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm({ labels }: { labels: Record<string, string> }) {
  const [state, action] = useActionState(deleteAccountAction, null);
  return (
    <form action={action} className="grid gap-3">
      <label className="label" htmlFor="confirm">
        {labels.deleteConfirm}
      </label>
      <input id="confirm" name="confirm" autoComplete="off" className="field" />
      <ActionMessage state={state} />
      <SubmitButton variant="danger">{labels.deleteButton}</SubmitButton>
    </form>
  );
}
