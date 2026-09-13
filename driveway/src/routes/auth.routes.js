import { Router } from 'express';
import { getDb, now } from '../db/index.js';
import { parse, schemas } from '../lib/validate.js';
import {
  hashPassword, checkPassword, createSession, destroySession,
  setSessionCookie, clearSessionCookie, requireAuth, publicUser, rateLimit
} from '../lib/auth.js';
import { wrap, conflict, unauthorized } from '../lib/errors.js';

export const authRouter = Router();

authRouter.post(
  '/signup',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  wrap(async (req, res) => {
    const data = parse(schemas.signup, req.body);
    const db = getDb();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) {
      throw conflict('An account with this email already exists. Try logging in.');
    }
    const id = db
      .prepare('INSERT INTO users (email, name, phone, zip, password_hash, created_at) VALUES (?,?,?,?,?,?)')
      .run(data.email, data.name, data.phone || null, data.zip || null, await hashPassword(data.password), now())
      .lastInsertRowid;

    setSessionCookie(res, createSession(id));
    res.status(201).json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id)) });
  })
);

authRouter.post(
  '/login',
  rateLimit({ windowMs: 15 * 60_000, max: 20 }),
  wrap(async (req, res) => {
    const data = parse(schemas.login, req.body);
    const user = getDb().prepare('SELECT * FROM users WHERE email = ?').get(data.email);
    // Same message either way, so the endpoint cannot be used to enumerate accounts.
    const ok = user && (await checkPassword(data.password, user.password_hash));
    if (!ok) throw unauthorized('Wrong email or password.');

    setSessionCookie(res, createSession(user.id));
    res.json({ user: publicUser(user) });
  })
);

authRouter.post('/logout', (req, res) => {
  destroySession(req.sessionToken);
  clearSessionCookie(res);
  res.json({ ok: true });
});

authRouter.get('/me', (req, res) => {
  res.json({ user: publicUser(req.user) });
});

/**
 * Marks the account as funds-verified so their offers carry the badge sellers
 * sort by. A real build connects a bank aggregator or a lender pre-approval;
 * this endpoint stands in for that step.
 */
authRouter.post(
  '/verify-funds',
  requireAuth,
  wrap(async (req, res) => {
    getDb().prepare('UPDATE users SET funds_verified = 1 WHERE id = ?').run(req.user.id);
    res.json({
      user: publicUser(getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)),
      prototypeNote: 'Stubbed verification — wire this to a bank aggregator or lender pre-approval API.'
    });
  })
);
