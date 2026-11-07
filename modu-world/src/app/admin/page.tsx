import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { numFmt } from "@/i18n/format";
import { stats } from "@/server/admin";
import { Stat } from "@/components/ui/misc";

export default async function AdminOverview() {
  const user = await requireRole("admin");
  const { t, locale } = await getDict();
  const { totals, daily } = await stats(user.id);
  const max = Math.max(1, ...daily.map((d) => d.activations));
  return (
    <div>
      <h1 className="text-3xl font-bold">{t.admin.nav.overview}</h1>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {totals &&
          (Object.keys(t.admin.stats) as (keyof typeof t.admin.stats)[]).map((k) => (
            <Stat key={k} label={t.admin.stats[k]} value={numFmt(totals[k] ?? 0, locale)} />
          ))}
      </div>
      <div className="card mt-6 p-6">
        <h2 className="font-sans text-sm font-semibold text-cream/80">{t.admin.activationsChart}</h2>
        <div className="mt-6 flex h-40 items-end gap-1.5" role="img" aria-label={t.admin.activationsChart}>
          {daily.map((d) => (
            <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[0.6rem] text-muted">{d.activations || ""}</span>
              <div className="w-full rounded-t-md bg-gradient-to-t from-peach-deep to-peach" style={{ height: `${(d.activations / max) * 100}%`, minHeight: 2 }} />
              <span className="text-[0.55rem] text-muted">{d.day.slice(3)}</span>
            </div>
          ))}
        </div>
      </div>
      {Number(totals?.pending_achievements ?? 0) > 0 && (
        <Link href="/admin/school" className="mt-6 inline-block text-sm text-peach underline">
          {t.admin.stats.pending_achievements}: {totals?.pending_achievements} →
        </Link>
      )}
    </div>
  );
}
