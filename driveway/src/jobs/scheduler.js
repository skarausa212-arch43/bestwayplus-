import { getDb, now } from '../db/index.js';
import { config } from '../config.js';
import { deadlineReminder } from '../services/notifications.js';

/**
 * Sends the "offers close soon" reminder once per listing.
 *
 * The stamp is written before the notifications go out: sending twice is worse
 * than not sending at all, and a crash mid-run must not produce a second email
 * on the next tick.
 */
export async function runDeadlineReminders(atMs = now()) {
  const db = getDb();
  const due = db
    .prepare(
      `SELECT * FROM listings
        WHERE status = 'active'
          AND deadline_at IS NOT NULL
          AND deadline_at > ?
          AND deadline_at <= ?
          AND deadline_notified_at IS NULL`
    )
    .all(atMs, atMs + config.jobs.deadlineWarningMs);

  const stamp = db.prepare('UPDATE listings SET deadline_notified_at = ? WHERE id = ?');
  let sent = 0;

  for (const listing of due) {
    stamp.run(atMs, listing.id);
    const hoursLeft = Math.max(1, Math.round((listing.deadline_at - atMs) / 3600000));
    try {
      await deadlineReminder({ listing, hoursLeft });
      sent += 1;
    } catch (err) {
      console.error(`deadline reminder for listing ${listing.id} failed:`, err.message);
    }
  }
  return { considered: due.length, sent };
}

/** Drops holds whose time is up so the car goes back on the market. */
export function expireHolds(atMs = now()) {
  return getDb().prepare('DELETE FROM holds WHERE expires_at <= ?').run(atMs).changes;
}

let timer = null;

export function startJobs() {
  if (!config.jobs.enabled || timer) return null;
  const tick = async () => {
    try {
      expireHolds();
      await runDeadlineReminders();
    } catch (err) {
      console.error('scheduled job failed:', err.message);
    }
  };
  timer = setInterval(tick, config.jobs.intervalMs);
  timer.unref?.(); // never hold the process open on its own
  tick();
  return timer;
}

export function stopJobs() {
  if (timer) clearInterval(timer);
  timer = null;
}
