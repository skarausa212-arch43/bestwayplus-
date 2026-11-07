import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomToken } from "@/lib/crypto";
import { env } from "@/lib/env";

/**
 * Private file storage for school evidence. Files are never public: they are only streamed
 * to admins during review and deleted right after the decision.
 * Drivers: local disk (dev/demo) or Supabase Storage (private bucket) via its REST API.
 */
export type StoredFile = { key: string };

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function localPath(key: string) {
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp|pdf)$/.test(key)) throw new Error("invalid key");
  return join(resolve(env().STORAGE_LOCAL_DIR), key);
}

function supabase() {
  const e = env();
  if (!e.SUPABASE_URL || !e.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase storage is not configured");
  return {
    base: `${e.SUPABASE_URL}/storage/v1/object/${e.SUPABASE_STORAGE_BUCKET}`,
    headers: { Authorization: `Bearer ${e.SUPABASE_SERVICE_ROLE_KEY}`, apikey: e.SUPABASE_SERVICE_ROLE_KEY },
  };
}

export async function putEvidence(data: ArrayBuffer, contentType: string): Promise<StoredFile> {
  const ext = EXT[contentType];
  if (!ext) throw new Error("unsupported type");
  const key = `${randomToken(18)}.${ext}`;
  if (env().STORAGE_DRIVER === "supabase") {
    const s = supabase();
    const res = await fetch(`${s.base}/${key}`, {
      method: "POST",
      headers: { ...s.headers, "Content-Type": contentType },
      body: data,
    });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  } else {
    await mkdir(resolve(env().STORAGE_LOCAL_DIR), { recursive: true });
    await writeFile(localPath(key), Buffer.from(data));
  }
  return { key };
}

export async function getEvidence(key: string): Promise<{ body: Buffer; contentType: string } | null> {
  const ext = key.split(".").pop() ?? "";
  const contentType = Object.entries(EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  try {
    if (env().STORAGE_DRIVER === "supabase") {
      const s = supabase();
      const res = await fetch(`${s.base}/${key}`, { headers: s.headers });
      if (!res.ok) return null;
      return { body: Buffer.from(await res.arrayBuffer()), contentType };
    }
    return { body: await readFile(localPath(key)), contentType };
  } catch {
    return null;
  }
}

export async function deleteEvidence(key: string): Promise<void> {
  if (env().STORAGE_DRIVER === "supabase") {
    const s = supabase();
    await fetch(`${s.base}/${key}`, { method: "DELETE", headers: s.headers });
  } else {
    await rm(localPath(key), { force: true });
  }
}

/** Checks magic bytes, not just the browser-supplied MIME type. */
export function sniffType(buf: Uint8Array): string | null {
  const hex = Buffer.from(buf.slice(0, 12)).toString("hex");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e47")) return "image/png";
  if (hex.startsWith("52494646") && hex.slice(16, 24) === "57454250") return "image/webp";
  if (hex.startsWith("25504446")) return "application/pdf";
  return null;
}
