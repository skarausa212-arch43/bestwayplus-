"use client";

import * as React from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";
import { Notice } from "./misc";
import type { ActionState } from "@/lib/utils";

/** Submit button that shows a spinner and blocks double submits while the action runs. */
export function SubmitButton({ children, pendingText, ...props }: ButtonProps & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} aria-busy={pending} {...props}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}

/** Shows the result of a server action. After a success it refreshes server components so lists update. */
export function ActionMessage({ state, refresh = true }: { state: ActionState; refresh?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!refresh || !state?.ok) return;
    // run after the action's transition has settled, otherwise the refresh can be dropped
    const id = setTimeout(() => router.refresh(), 0);
    return () => clearTimeout(id);
  }, [state, router, refresh]);
  if (!state) return null;
  if (state.ok && state.message) return <Notice tone="success">{state.message}</Notice>;
  if (!state.ok && state.error) return <Notice tone="error">{state.error}</Notice>;
  return null;
}

export function Field({
  label,
  error,
  hint,
  children,
  htmlFor,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && !error && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {error && (
        <p className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Small form for one-click server actions (with optional confirm prompt). */
export function ActionButton({
  action,
  fields,
  children,
  confirm,
  ...props
}: ButtonProps & {
  action: (fd: FormData) => Promise<void>;
  fields: Record<string, string>;
  confirm?: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SubmitButton {...props}>{children}</SubmitButton>
    </form>
  );
}
