import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

/**
 * Argon2id with parameters sized for an interactive login. Raise the memory
 * cost rather than the iterations if the hardware allows.
 */
const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON_OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Opaque, single-use token. The plaintext is shown once and never stored. */
export function newToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: hashToken(token) };
}

/**
 * Tokens are hashed with a server pepper so a database read alone cannot mint
 * a session or a password reset.
 */
export function hashToken(token: string): string {
  const pepper = process.env.TOKEN_PEPPER ?? '';
  return createHash('sha256').update(`${pepper}:${token}`).digest('hex');
}

export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Used for consent records — proves which wording the user was shown. */
export function textHash(text: string): string {
  return createHash('sha256').update(text.trim()).digest('hex');
}
