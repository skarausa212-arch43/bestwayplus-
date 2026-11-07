import { NextResponse } from "next/server";
import { certificateMetadata } from "@/server/web3";
import { env } from "@/lib/env";

/** ERC-721 tokenURI target. Public, contains no personal data. */
export async function GET(_: Request, { params }: { params: Promise<{ tokenId: string }> }) {
  const { tokenId } = await params;
  const meta = await certificateMetadata(tokenId);
  if (!meta) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const base = env().APP_URL.replace(/\/$/, "");
  return NextResponse.json({ ...meta, image: base + meta.image, external_url: `${base}/collectors` }, {
    headers: { "Cache-Control": "public, max-age=300" },
  });
}
