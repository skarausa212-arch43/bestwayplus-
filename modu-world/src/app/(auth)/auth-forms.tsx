"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import { loginSchema, registerSchema } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/form";
import { Notice } from "@/components/ui/misc";
import { loginAction, registerAction } from "./actions";

type Labels = Record<string, string>;

export function LoginForm({ labels, next }: { labels: Labels; next?: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof loginSchema>>({ resolver: zodResolver(loginSchema) });
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await loginAction({ ...values, next });
      if (res && !res.ok) setError(res.error);
    }),
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && <Notice tone="error">{error}</Notice>}
      <Field label={labels.email} htmlFor="email" error={form.formState.errors.email && labels.required}>
        <input id="email" type="email" autoComplete="email" className="field" {...form.register("email")} />
      </Field>
      <Field label={labels.password} htmlFor="password" error={form.formState.errors.password && labels.required}>
        <input id="password" type="password" autoComplete="current-password" className="field" {...form.register("password")} />
      </Field>
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} {labels.loginButton}
      </Button>
      <p className="text-center text-sm text-muted">
        {labels.noAccount}{" "}
        <Link className="text-peach hover:underline" href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          {labels.register}
        </Link>
      </p>
    </form>
  );
}

export function RegisterForm({ labels, next }: { labels: Labels; next?: string }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const form = useForm<z.input<typeof registerSchema>>({ resolver: zodResolver(registerSchema) });
  const e = form.formState.errors;
  const onSubmit = form.handleSubmit((values) =>
    start(async () => {
      const res = await registerAction({ ...values, next });
      if (res && !res.ok) setError(res.error);
    }),
  );
  return (
    <form onSubmit={onSubmit} className="grid gap-4" noValidate>
      {error && <Notice tone="error">{error}</Notice>}
      <Field label={labels.displayName} htmlFor="displayName" error={e.displayName && labels.required}>
        <input id="displayName" autoComplete="name" className="field" {...form.register("displayName")} />
      </Field>
      <Field label={labels.email} htmlFor="email" error={e.email && labels.required}>
        <input id="email" type="email" autoComplete="email" className="field" {...form.register("email")} />
      </Field>
      <Field label={labels.password} htmlFor="password" hint={labels.passwordHint} error={e.password && labels.passwordHint}>
        <input id="password" type="password" autoComplete="new-password" className="field" {...form.register("password")} />
      </Field>
      <label className="flex items-start gap-3 text-sm text-cream/80">
        <input type="checkbox" className="mt-1 size-4 accent-[#f4b58d]" {...form.register("acceptTerms")} />
        <span>
          {labels.acceptTerms} (
          <Link href="/legal/terms" className="text-peach underline" target="_blank">
            terms
          </Link>
          ,{" "}
          <Link href="/legal/privacy" className="text-peach underline" target="_blank">
            privacy
          </Link>
          )
        </span>
      </label>
      {e.acceptTerms && <p className="-mt-2 text-xs text-danger">{labels.required}</p>}
      <Button type="submit" size="lg" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />} {labels.registerButton}
      </Button>
      <p className="text-center text-sm text-muted">
        {labels.haveAccount}{" "}
        <Link className="text-peach hover:underline" href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`}>
          {labels.login}
        </Link>
      </p>
    </form>
  );
}
