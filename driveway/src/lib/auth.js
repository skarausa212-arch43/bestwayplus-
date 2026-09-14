import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { getDb, now } from '../db/index.js';
import { config, isProd } from '../config.js';
import { unauthorized, tooMany } from './errors.js';

const COOKIE = 'dw_session';
const DAY = 24 * 60 * 60 * 1000;

export const hashPassword = (plain) => bcrypt.hash(plain, config.bcryptRounds);
export const checkPassword = (plain, hash) => bcrypt.compare(plain, hash);

/** Tokens are random; only their SHA-256 is stored, so the DB never holds a usable session. */
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ts = now();
  getDb()
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?,?,?,?)')
    .run(hashToken(token), userId, ts, ts + config.sessionDays * DAY);
  return token;
}

export function destroySession(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function userForToken(token) {
  if (!token) return null;
  const row = getDb()
    .prepare(
      `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ?`
    )
    .get(hashToken(token), now());
  return row || null;
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: config.sessionDays * DAY,
    path: '/'
  });
}

export const clearSessionCookie = (res) => res.clearCookie(COOKIE, { path: '/' });

/** Populates req.user when a valid session cookie is present. Never rejects. */
export function attachUser(req, _res, next) {
  req.sessionToken = req.cookies?.[COOKIE];
  req.user = userForToken(req.sessionToken);
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

/** The shape of a user we are willing to send to the client. */
export const publicUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    zip: u.zip,
    fundsVerified: !!u.funds_verified,
    notifyEmail: u.notify_email !== 0,
    createdAt: u.created_at
  };

/* ---- crude in-memory rate limiter, enough until a real store is added ---- */
const buckets = new Map();
export function rateLimit({ windowMs = 60_000, max = 10, key = (req) => req.ip, enabled } = {}) {
  const on = enabled ?? config.rateLimitEnabled;
  if (!on) return (_req, _res, next) => next();
  return (req, res, next) => {
    const k = `${req.path}:${key(req)}`;
    const ts = now();
    const b = buckets.get(k);
    if (!b || ts > b.reset) {
      buckets.set(k, { count: 1, reset: ts + windowMs });
      return next();
    }
    if (++b.count > max) {
      res.set('Retry-After', Math.ceil((b.reset - ts) / 1000));
      return next(tooMany());
    }
    next();
  };
}
