import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');

const int = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int(process.env.PORT, 3000),
  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'driveway.sqlite'),
  uploadDir: process.env.UPLOAD_DIR || path.join(ROOT, 'uploads'),
  publicDir: path.join(ROOT, 'public'),

  sessionDays: int(process.env.SESSION_DAYS, 30),
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, 12),

  // Off under `node --test`, where the whole suite shares one IP.
  // Set RATE_LIMIT=off to disable it locally too.
  rateLimitEnabled:
    process.env.RATE_LIMIT !== 'off' && (process.env.NODE_ENV || 'development') !== 'test',

  photo: {
    maxPerListing: 12,
    maxBytes: 10 * 1024 * 1024,
    fullWidth: 1600,
    thumbWidth: 480,
    quality: 82
  },

  // A hold takes a car off the market for everyone else.
  holdHours: int(process.env.HOLD_HOURS, 48),
  holdDepositCents: int(process.env.HOLD_DEPOSIT_CENTS, 50000),

  mail: {
    // memory: kept in an array for tests · file: written to outbox/ as .eml so
    // you can read exactly what would have been sent · console · smtp: real send
    transport: process.env.MAIL_TRANSPORT || ((process.env.NODE_ENV || 'development') === 'test' ? 'memory' : 'file'),
    outDir: process.env.MAIL_DIR || path.join(ROOT, 'outbox'),
    from: process.env.MAIL_FROM || 'Driveway <no-reply@driveway.example>',
    smtp: {
      host: process.env.SMTP_HOST,
      port: int(process.env.SMTP_PORT, 587),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  },

  appUrl: process.env.APP_URL || `http://localhost:${int(process.env.PORT, 3000)}`,

  jobs: {
    enabled: process.env.JOBS !== 'off' && (process.env.NODE_ENV || 'development') !== 'test',
    intervalMs: int(process.env.JOBS_INTERVAL_MS, 15 * 60 * 1000),
    // How long before a listing's offer deadline the reminder goes out.
    deadlineWarningMs: int(process.env.DEADLINE_WARNING_MS, 24 * 60 * 60 * 1000)
  }
};

export const isProd = config.env === 'production';
