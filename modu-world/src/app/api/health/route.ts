import { NextResponse } from "next/server";
import { withUser } from "@/lib/db";

export async function GET() {
  try {
    await withUser(null, (db) => db.query("select 1"));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
