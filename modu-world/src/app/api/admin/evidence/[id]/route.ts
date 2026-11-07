import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { evidenceKeyFor } from "@/server/school";
import { getEvidence } from "@/server/storage";
import { withUser } from "@/lib/db";

/** Streams a pending achievement's evidence to an admin only. Never cached, never public. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user?.roles.includes("admin")) return new NextResponse("Forbidden", { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return new NextResponse("Not found", { status: 404 });
  const key = await evidenceKeyFor(user.id, id);
  const file = key ? await getEvidence(key) : null;
  if (!file) return new NextResponse("Not found", { status: 404 });
  await withUser(user.id, (db) => db.query("select app.audit('achievement.evidence_view', 'school_achievement', $1)", [id]));
  return new NextResponse(new Uint8Array(file.body), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    },
  });
}
