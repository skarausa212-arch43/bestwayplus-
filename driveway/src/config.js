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
  holdDepositCents: int(process.env.HOLD_DEPOSIT_CENTS, 50000)
};

export const isProd = config.env === 'production';
