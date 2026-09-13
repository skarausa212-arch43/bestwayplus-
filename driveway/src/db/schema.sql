-- Driveway schema (SQLite).
-- Written so it ports to Postgres with minimal edits: no SQLite-only types,
-- explicit timestamps as integers (epoch ms), foreign keys everywhere.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  email          TEXT    NOT NULL UNIQUE,
  name           TEXT    NOT NULL,
  phone          TEXT,
  zip            TEXT,
  password_hash  TEXT    NOT NULL,
  funds_verified INTEGER NOT NULL DEFAULT 0,
  created_at     INTEGER NOT NULL
);

-- Session tokens are stored hashed: a database leak must not hand out sessions.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT    PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS listings (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make         TEXT    NOT NULL,
  model        TEXT    NOT NULL,
  year         INTEGER NOT NULL,
  miles        INTEGER NOT NULL,
  price        INTEGER NOT NULL,
  body         TEXT    NOT NULL DEFAULT 'Sedan',
  transmission TEXT    NOT NULL DEFAULT 'Automatic',
  fuel         TEXT    NOT NULL DEFAULT 'Gasoline',
  doors        INTEGER NOT NULL DEFAULT 4,
  tow_lb       INTEGER NOT NULL DEFAULT 0,
  ev_soh       INTEGER NOT NULL DEFAULT 0,
  safety       INTEGER NOT NULL DEFAULT 4,
  city         TEXT    NOT NULL,
  state        TEXT    NOT NULL,
  vin          TEXT,
  description  TEXT    NOT NULL DEFAULT '',
  loan_balance INTEGER NOT NULL DEFAULT 0,
  deadline_at  INTEGER,
  status       TEXT    NOT NULL DEFAULT 'active',  -- active | sold | removed
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_listings_status  ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_user    ON listings(user_id);
CREATE INDEX IF NOT EXISTS idx_listings_make    ON listings(make, model);

CREATE TABLE IF NOT EXISTS listing_photos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  path       TEXT    NOT NULL,
  thumb_path TEXT    NOT NULL,
  tag        TEXT    NOT NULL DEFAULT 'other',
  position   INTEGER NOT NULL DEFAULT 0,
  width      INTEGER,
  height     INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_photos_listing ON listing_photos(listing_id, position);

CREATE TABLE IF NOT EXISTS listing_price_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  price      INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_price_hist ON listing_price_history(listing_id, created_at);

-- Automatic negotiation rules, one row per listing.
CREATE TABLE IF NOT EXISTS listing_rules (
  listing_id    INTEGER PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  accept_at     INTEGER NOT NULL,
  counter_at    INTEGER NOT NULL,
  decline_below INTEGER NOT NULL
);

-- Free history panel data. Synthetic today, NMVTIS/NHTSA-backed later.
CREATE TABLE IF NOT EXISTS vehicle_history (
  listing_id  INTEGER PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  title_brand TEXT    NOT NULL DEFAULT 'Clean',
  owners      INTEGER NOT NULL DEFAULT 1,
  accidents   INTEGER NOT NULL DEFAULT 0,
  flood       INTEGER NOT NULL DEFAULT 0,
  rust_years  INTEGER NOT NULL DEFAULT 0,
  recalls     TEXT    NOT NULL DEFAULT '[]',   -- JSON array of strings
  obd         TEXT                             -- JSON {codes:[],ready:1}
);

CREATE TABLE IF NOT EXISTS service_records (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id     INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         INTEGER NOT NULL,
  message        TEXT    NOT NULL DEFAULT '',
  status         TEXT    NOT NULL DEFAULT 'pending', -- pending|accepted|countered|declined|withdrawn
  counter_amount INTEGER,
  auto_handled   INTEGER NOT NULL DEFAULT 0,
  verified_funds INTEGER NOT NULL DEFAULT 0,
  from_standing  INTEGER NOT NULL DEFAULT 0,
  scam_flags     TEXT    NOT NULL DEFAULT '[]',
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_offers_listing ON offers(listing_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_buyer   ON offers(buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offers_seller  ON offers(seller_id, status);

-- Standing bids: a limit order that fires at matching new listings.
CREATE TABLE IF NOT EXISTS standing_bids (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  make       TEXT,
  model      TEXT,
  year_min   INTEGER NOT NULL DEFAULT 0,
  max_miles  INTEGER NOT NULL DEFAULT 0,
  state      TEXT,
  amount     INTEGER NOT NULL,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_standing_active ON standing_bids(active, make);

-- Every accepted offer lands here and becomes a public sold-price comp.
CREATE TABLE IF NOT EXISTS sales (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER REFERENCES listings(id) ON DELETE SET NULL,
  offer_id   INTEGER REFERENCES offers(id) ON DELETE SET NULL,
  seller_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  buyer_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  make       TEXT    NOT NULL,
  model      TEXT    NOT NULL,
  year       INTEGER NOT NULL,
  miles      INTEGER NOT NULL,
  state      TEXT    NOT NULL,
  price      INTEGER NOT NULL,
  source     TEXT    NOT NULL DEFAULT 'driveway', -- driveway | seed
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sales_model ON sales(make, model, created_at DESC);

CREATE TABLE IF NOT EXISTS holds (
  listing_id INTEGER PRIMARY KEY REFERENCES listings(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS wanted_posts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  budget     INTEGER NOT NULL DEFAULT 0,
  timeframe  TEXT    NOT NULL DEFAULT '',
  note       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
