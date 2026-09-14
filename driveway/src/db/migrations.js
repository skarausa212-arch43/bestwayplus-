/**
 * Schema migrations.
 *
 * schema.sql creates everything a fresh database needs. These migrations carry
 * an existing database forward, and each one is recorded so it runs only once.
 * Keep them additive and idempotent: a deployed database must survive a rollout
 * that is half-applied.
 */

const hasColumn = (db, table, column) =>
  db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);

const addColumn = (db, table, column, definition) => {
  if (hasColumn(db, table, column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
};

export const MIGRATIONS = [
  {
    id: '002-cold-start-audio',
    up(db) {
      // A ten-second recording of the engine starting cold: knocking, belt
      // squeal and rough idle are audible, and it is far harder to fake than a photo.
      addColumn(db, 'listings', 'audio_path', 'TEXT');
      addColumn(db, 'listings', 'audio_at', 'INTEGER');
    }
  },
  {
    id: '003-obd-source',
    up(db) {
      // Records where a diagnostic report came from, so a self-reported scan is
      // never displayed as if it were verified.
      addColumn(db, 'vehicle_history', 'obd_source', "TEXT NOT NULL DEFAULT 'self-reported'");
      addColumn(db, 'vehicle_history', 'obd_at', 'INTEGER');
    }
  }
];

MIGRATIONS.push(
  {
    id: '004-notifications',
    up(db) {
      db.exec(`CREATE TABLE IF NOT EXISTS notifications (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        kind           TEXT    NOT NULL,
        title          TEXT    NOT NULL,
        body           TEXT    NOT NULL,
        link           TEXT,
        data           TEXT    NOT NULL DEFAULT '{}',
        created_at     INTEGER NOT NULL,
        read_at         INTEGER,
        email_to       TEXT,
        email_sent_at  INTEGER,
        email_error    TEXT,
        email_attempts INTEGER NOT NULL DEFAULT 0
      )`);
      db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(user_id, read_at)');
    }
  },
  {
    id: '005-email-preference',
    up(db) {
      // Opting out silences email but keeps the in-app feed: a seller must
      // still be able to find out that an offer arrived.
      addColumn(db, 'users', 'notify_email', 'INTEGER NOT NULL DEFAULT 1');
    }
  },
  {
    id: '006-deadline-reminder',
    up(db) {
      // Stamped when the closing reminder goes out, so the job cannot send twice.
      addColumn(db, 'listings', 'deadline_notified_at', 'INTEGER');
    }
  }
);

export function runMigrations(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id         TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )`);

  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((r) => r.id));
  const record = db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)');
  const done = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    db.transaction(() => {
      migration.up(db);
      record.run(migration.id, Date.now());
    })();
    done.push(migration.id);
  }
  return done;
}
