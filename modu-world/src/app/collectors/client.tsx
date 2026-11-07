"use client";

import { useActionState } from "react";
import { Award } from "lucide-react";
import { SubmitButton, ActionMessage } from "@/components/ui/form";
import { requestCertificateAction } from "./actions";

export function CertificateButton({ toyId, label }: { toyId: string; label: string }) {
  const [state, action] = useActionState(requestCertificateAction, null);
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="toyId" value={toyId} />
      <SubmitButton size="sm" variant="gold">
        <Award /> {label}
      </SubmitButton>
      <ActionMessage state={state} />
    </form>
  );
}
