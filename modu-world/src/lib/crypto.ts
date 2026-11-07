import "server-only";
import { createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { env } from "./env";

type ScryptFn = (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const scrypt: ScryptFn = (pw, salt, len, opts) =>
  new Promise((resolve, reject) => scryptCb(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));
const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/** URL-safe random token. 16 bytes = 128 bits: infeasible to enumerate. */
export function randomToken(bytes = 16): string {
  return randomBytes(bytes).toString("base64url");
}

/** Keyed hash for one-time codes and session tokens (the pepper lives only in server env). */
export function hmac(value: string, purpose: string): string {
  return createHmac("sha256", env().SECRET_PEPPER).update(`${purpose}:${value}`).digest("hex");
}

// No 0/O/1/I/L to avoid misreading printed cards.
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** Human-friendly one-time code, e.g. "K7QF-29XM" (~40 bits; brute force is stopped by lockouts + rate limits). */
export function humanCode(groups = 2, size = 4): string {
  const out: string[] = [];
  for (let g = 0; g < groups; g++) {
    let s = "";
    for (let i = 0; i < size; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
    out.push(s);
  }
  return out.join("-");
}

export function normalizeCode(input: string): string {
  const raw = input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return raw.match(/.{1,4}/g)?.join("-") ?? "";
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, SCRYPT);
  return `scrypt$${salt.toString("base64")}$${key.toString("base64")}`;
}

const DUMMY_HASH = `scrypt$${Buffer.alloc(16).toString("base64")}$${Buffer.alloc(32).toString("base64")}`;

export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  // Same work for unknown users, so response time does not reveal which emails exist.
  const [, saltB64, keyB64] = (stored ?? DUMMY_HASH).split("$");
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), 32, SCRYPT);
  const expected = Buffer.from(keyB64, "base64");
  return stored !== null && expected.length === key.length && timingSafeEqual(expected, key);
}
