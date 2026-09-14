import { getDb, now } from '../db/index.js';

const db = () => getDb();

export function insertNotification({ userId, kind, title, body, link = null, data = {}, emailTo = null }) {
  return Number(
    db()
      .prepare(
        `INSERT INTO notifications (user_id, kind, title, body, link, data, created_at, email_to)
         VALUES (?,?,?,?,?,?,?,?)`
      )
      .run(userId, kind, title, body, link, JSON.stringify(data), now(), emailTo).lastInsertRowid
  );
}

export const markEmailSent = (id, transport) =>
  db().prepare('UPDATE notifications SET email_sent_at = ?, email_attempts = email_attempts + 1, email_error = NULL WHERE id = ?')
    .run(now(), id) && transport;

export const markEmailFailed = (id, message) =>
  db().prepare('UPDATE notifications SET email_attempts = email_attempts + 1, email_error = ? WHERE id = ?')
    .run(String(message).slice(0, 400), id);

export const listForUser = (userId, limit = 30) =>
  db()
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?')
    .all(userId, limit)
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      title: n.title,
      body: n.body,
      link: n.link,
      data: JSON.parse(n.data || '{}'),
      createdAt: n.created_at,
      read: !!n.read_at,
      emailSent: !!n.email_sent_at,
      emailError: n.email_error || null
    }));

export const unreadCount = (userId) =>
  db().prepare('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL').get(userId).n;

export function markRead(userId, ids = null) {
  if (ids && ids.length) {
    const marks = ids.map(() => '?').join(',');
    return db()
      .prepare(`UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL AND id IN (${marks})`)
      .run(now(), userId, ...ids).changes;
  }
  return db()
    .prepare('UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL')
    .run(now(), userId).changes;
}
