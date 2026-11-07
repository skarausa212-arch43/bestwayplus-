import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";
export const metadata = { title: "Admin", robots: { index: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireRole("admin", "/admin");
  const { t } = await getDict();
  return (
    <div className="container-x grid gap-6 pb-10 pt-6 lg:grid-cols-[220px_1fr]">
      <aside>
        <p className="eyebrow mb-3">{t.admin.title}</p>
        <AdminNav labels={t.admin.nav} />
      </aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
