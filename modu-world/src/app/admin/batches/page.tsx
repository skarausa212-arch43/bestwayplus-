import { Download } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { getDict } from "@/i18n";
import { dateFmt } from "@/i18n/format";
import { listBatches } from "@/server/admin";
import { listCharacters } from "@/server/catalog";
import { Badge } from "@/components/ui/misc";
import { BatchForm } from "../forms";

export default async function BatchesPage() {
  const user = await requireRole("admin");
  const { t, locale } = await getDict();
  const [batches, characters] = await Promise.all([listBatches(user.id), listCharacters()]);
  return (
    <div className="grid gap-8">
      <section className="card p-6">
        <h1 className="text-2xl font-bold">{t.admin.newBatch}</h1>
        <div className="mt-6">
          <BatchForm characters={characters.map((c) => ({ id: c.id, name: c.name }))} labels={t.admin} />
        </div>
      </section>
      <section>
        <h2 className="text-xl font-bold">{t.admin.batches}</h2>
        <div className="mt-4 overflow-x-auto rounded-3xl border border-line">
          <table className="w-full min-w-[640px] text-left text-sm">
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className="border-t border-line first:border-0">
                  <td className="px-4 py-3 font-mono">{b.code}</td>
                  <td className="px-4 py-3">{b.character_name}</td>
                  <td className="px-4 py-3">{b.edition} {b.is_demo && <Badge tone="demo">DEMO</Badge>}</td>
                  <td className="px-4 py-3">{b.activated}/{b.quantity} {t.admin.activatedOf}</td>
                  <td className="px-4 py-3 text-muted">{dateFmt(b.created_at, locale)}</td>
                  <td className="px-4 py-3 text-right">
                    <a href={`/api/admin/batches/${b.id}/export`} className="inline-flex items-center gap-1 text-peach hover:underline">
                      <Download className="size-4" /> {t.admin.exportUrls}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
