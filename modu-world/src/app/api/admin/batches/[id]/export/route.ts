import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { batchExportRows, toCsv } from "@/server/admin";

/** URL-only CSV for (re-)encoding NFC tags. Activation codes are never exportable after creation. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.roles.includes("admin")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const rows = await batchExportRows(user.id, id);
  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="modu-batch-${id.slice(0, 8)}-urls.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
