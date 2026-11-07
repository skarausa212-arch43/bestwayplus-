import { redirect } from "next/navigation";
import { getDict } from "@/i18n";
import { getSessionUser, safeNext } from "@/lib/auth";
import { AuthShell } from "../auth-shell";
import { LoginForm } from "../auth-forms";
import { DemoAccounts } from "../demo-accounts";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  if (await getSessionUser()) redirect(safeNext(next));
  const { t } = await getDict();
  return (
    <AuthShell title={t.auth.loginTitle} text={t.auth.loginText} aside={<DemoAccounts title={t.auth.demoTitle} text={t.auth.demoText} />}>
      <LoginForm next={next} labels={{ ...t.auth, register: t.nav.register, required: t.common.required }} />
      <div className="mt-6 lg:hidden">
        <DemoAccounts title={t.auth.demoTitle} text={t.auth.demoText} />
      </div>
    </AuthShell>
  );
}
