import { redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { getSessionUser, safeNext } from "@/lib/auth";
import { AuthShell } from "../auth-shell";
import { RegisterForm } from "../auth-forms";

export const metadata = { title: "Create account" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(safeNext(next));
  const { t } = await getDict();
  return (
    <AuthShell title={t.auth.registerTitle} text={t.auth.registerText}>
      <RegisterForm next={next} labels={{ ...t.auth, login: t.nav.login, required: t.common.required }} />
    </AuthShell>
  );
}
