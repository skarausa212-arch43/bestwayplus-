-- MODU WORLD — core schema
-- Runs on plain PostgreSQL 15+ and on Supabase Postgres.
create extension if not exists pgcrypto;

create schema if not exists app;

-- Runtime role used by the Next.js server. It is NOT the table owner, so RLS applies to it.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'modu_app') then
    create role modu_app nologin;
  end if;
end $$;

-- ───────────── Identity ─────────────
create type app_role as enum ('child', 'parent', 'collector', 'partner', 'admin');

create table partners (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null,
  description   jsonb not null default '{}'::jsonb,        -- {ru: "...", en: "..."}
  website       text,
  is_concept    boolean not null default false,             -- concept / not-yet-confirmed partner
  disclaimer    jsonb not null default '{}'::jsonb,
  status        text not null default 'active' check (status in ('active', 'paused')),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now()
);

create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text,
  password_hash text,
  roles         app_role[] not null default '{parent}',
  partner_id    uuid references partners(id) on delete set null,
  status        text not null default 'active' check (status in ('active', 'disabled', 'deleted')),
  is_demo       boolean not null default false,
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  -- a child account never has its own credentials: it is managed by a parent
  constraint child_has_no_credentials check (not ('child' = any(roles)) or (email is null and password_hash is null)),
  constraint child_is_only_child check (not ('child' = any(roles)) or roles = '{child}')
);
create unique index users_email_key on users (lower(email)) where email is not null;

create table sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token_hash  text not null unique,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  user_agent  text
);
create index sessions_user_idx on sessions (user_id);

create table profiles (
  user_id                  uuid primary key references users(id) on delete cascade,
  display_name             text not null check (char_length(display_name) between 1 and 60),
  birth_year               int check (birth_year between 1900 and 2100),   -- year only: data minimisation
  locale                   text not null default 'ru' check (locale in ('ru', 'en', 'be', 'pl')),
  adult_attested_at        timestamptz,       -- self-declared 18+ (real KYC is an external integration)
  terms_accepted_at        timestamptz,
  public_collection        boolean not null default false,
  updated_at               timestamptz not null default now()
);

create table parent_child_links (
  id               uuid primary key default gen_random_uuid(),
  parent_id        uuid not null references users(id) on delete cascade,
  child_id         uuid not null references users(id) on delete cascade,
  consent_given_at timestamptz not null,
  consent_version  text not null,
  created_at       timestamptz not null default now(),
  unique (parent_id, child_id),
  check (parent_id <> child_id)
);
create index parent_child_links_child_idx on parent_child_links (child_id);

-- ───────────── Toys & NFC ─────────────
create table characters (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name          text not null,
  serial_prefix text not null unique check (serial_prefix ~ '^[A-Z]{2,4}$'),
  series        text not null,
  min_age       int not null check (min_age between 0 and 21),
  rarity        text not null check (rarity in ('common', 'rare', 'epic', 'legendary')),
  content       jsonb not null default '{}'::jsonb,   -- {ru:{tagline,story,traits[]}, en:{...}}
  accessories   jsonb not null default '[]'::jsonb,   -- [{slug, name:{ru,en}, kind:'physical'|'digital'}]
  image_path    text not null,
  accent_color  text not null default '#F4B58D',
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

create table toy_batches (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique check (code ~ '^[A-Z0-9-]{3,24}$'),
  character_id  uuid not null references characters(id),
  quantity      int not null check (quantity between 1 and 1000),
  edition       text not null default 'standard' check (edition in ('standard', 'collector', 'prototype')),
  notes         text,
  is_demo       boolean not null default false,
  created_by    uuid references users(id),
  created_at    timestamptz not null default now()
);

create table toy_instances (
  id                uuid primary key default gen_random_uuid(),
  batch_id          uuid not null references toy_batches(id),
  character_id      uuid not null references characters(id),
  serial_number     text not null unique,
  edition_number    int not null check (edition_number > 0),
  status            text not null default 'in_stock'
                    check (status in ('in_stock', 'activated', 'transfer_pending', 'revoked')),
  owner_user_id     uuid references users(id) on delete set null,
  assigned_child_id uuid references users(id) on delete set null,
  activated_at      timestamptz,
  created_at        timestamptz not null default now(),
  unique (batch_id, edition_number)
);
create index toy_instances_owner_idx on toy_instances (owner_user_id);
create index toy_instances_child_idx on toy_instances (assigned_child_id);

create table nfc_tags (
  id                         uuid primary key default gen_random_uuid(),
  toy_instance_id            uuid not null unique references toy_instances(id),
  public_token               text not null unique check (public_token ~ '^[A-Za-z0-9_-]{20,64}$'),
  tag_type                   text not null default 'ntag215'
                             check (tag_type in ('ntag213', 'ntag215', 'ntag216', 'ntag424_dna')),
  chip_uid                   text unique,      -- optional, recorded at encoding time
  sdm_key_ref                text,             -- future: reference to a KMS key for NTAG 424 DNA SUN verification
  sdm_last_counter           int,              -- future: monotonic SUN counter (replay protection)
  activation_secret_hash     text,             -- HMAC of the one-time activation code; code itself is never stored
  activation_secret_issued_at timestamptz,
  activation_secret_used_at  timestamptz,
  failed_attempts            int not null default 0,
  locked_until               timestamptz,
  scan_count                 int not null default 0,
  last_scanned_at            timestamptz,
  status                     text not null default 'active' check (status in ('active', 'revoked')),
  created_at                 timestamptz not null default now()
);

create table activations (
  id               uuid primary key default gen_random_uuid(),
  toy_instance_id  uuid not null unique references toy_instances(id),
  nfc_tag_id       uuid not null references nfc_tags(id),
  user_id          uuid references users(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table ownership_transfers (
  id               uuid primary key default gen_random_uuid(),
  toy_instance_id  uuid not null references toy_instances(id),
  from_user_id     uuid references users(id) on delete set null,
  to_user_id       uuid references users(id) on delete set null,
  code_hash        text not null,
  status           text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'expired')),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz
);
create unique index ownership_transfers_one_pending on ownership_transfers (toy_instance_id) where status = 'pending';
create index ownership_transfers_toy_idx on ownership_transfers (toy_instance_id, created_at desc);

-- ───────────── MODU School ─────────────
create table school_achievements (
  id                  uuid primary key default gen_random_uuid(),
  child_id            uuid not null references users(id) on delete cascade,
  submitted_by        uuid references users(id) on delete set null,
  kind                text not null check (kind in ('grade', 'improvement', 'task', 'olympiad')),
  subject             text not null check (char_length(subject) between 2 and 40),
  period              text not null check (char_length(period) between 2 and 20),   -- e.g. "2026-Q1"
  previous_value      numeric(4,1) check (previous_value between 0 and 10),
  current_value       numeric(4,1) check (current_value between 0 and 10),          -- Belarusian 10-point scale
  description         text check (char_length(description) <= 280),
  evidence_path       text,              -- storage object key; deleted after review
  evidence_deleted_at timestamptz,
  status              text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  fingerprint         text not null,     -- dedupe: same child + kind + subject + period + values
  points_awarded      int not null default 0,
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz,
  unique (child_id, fingerprint)
);
create index school_achievements_status_idx on school_achievements (status, created_at);

create table achievement_reviews (
  id              uuid primary key default gen_random_uuid(),
  achievement_id  uuid not null unique references school_achievements(id) on delete cascade,
  reviewer_id     uuid references users(id) on delete set null,
  decision        text not null check (decision in ('approved', 'rejected')),
  points          int not null default 0 check (points between 0 and 500),
  comment         text check (char_length(comment) <= 280),
  created_at      timestamptz not null default now()
);

-- ───────────── MODU Points (bonus points — never convertible to crypto) ─────────────
create table points_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references users(id) on delete cascade,
  balance     int not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now()
);

create table points_transactions (
  id               uuid primary key default gen_random_uuid(),
  account_id       uuid not null references points_accounts(id) on delete cascade,
  amount           int not null check (amount <> 0),
  balance_after    int not null check (balance_after >= 0),
  kind             text not null check (kind in ('welcome_bonus', 'achievement', 'redemption', 'refund', 'admin_credit', 'admin_debit')),
  reference_type   text,
  reference_id     uuid,
  idempotency_key  text not null unique,
  created_by       uuid references users(id) on delete set null,
  note             text,
  created_at       timestamptz not null default now()
);
create index points_transactions_account_idx on points_transactions (account_id, created_at desc);

-- ───────────── Rewards ─────────────
create table reward_catalog (
  id              uuid primary key default gen_random_uuid(),
  partner_id      uuid references partners(id),
  slug            text not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  title           jsonb not null,          -- {ru, en}
  description     jsonb not null default '{}'::jsonb,
  category        text not null default 'merch' check (category in ('merch', 'toys', 'partner', 'digital')),
  cost_points     int not null check (cost_points > 0),
  stock           int check (stock >= 0),          -- null = unlimited
  per_user_limit  int check (per_user_limit > 0),  -- null = unlimited
  valid_from      timestamptz,
  valid_until     timestamptz,
  coupon_ttl_days int not null default 30 check (coupon_ttl_days between 1 and 365),
  image_path      text,
  is_active       boolean not null default true,
  is_demo         boolean not null default false,
  created_at      timestamptz not null default now()
);

create table reward_redemptions (
  id               uuid primary key default gen_random_uuid(),
  reward_id        uuid not null references reward_catalog(id),
  account_id       uuid not null references points_accounts(id) on delete cascade,
  requested_by     uuid references users(id) on delete set null,
  points_spent     int not null check (points_spent > 0),
  status           text not null default 'issued' check (status in ('issued', 'redeemed', 'cancelled', 'expired')),
  idempotency_key  text not null unique,
  created_at       timestamptz not null default now()
);
create index reward_redemptions_account_idx on reward_redemptions (account_id, created_at desc);

create table coupons (
  id             uuid primary key default gen_random_uuid(),
  redemption_id  uuid not null unique references reward_redemptions(id) on delete cascade,
  reward_id      uuid not null references reward_catalog(id),
  partner_id     uuid references partners(id),
  code           text not null unique,
  status         text not null default 'issued' check (status in ('issued', 'redeemed', 'void')),
  expires_at     timestamptz not null,
  redeemed_at    timestamptz,
  redeemed_by    uuid references users(id) on delete set null,
  created_at     timestamptz not null default now()
);

-- ───────────── Collectors / Web3 (adults only, testnet) ─────────────
create table blockchain_links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  address      text not null check (address ~ '^0x[0-9a-f]{40}$'),
  chain_id     int not null,
  verified_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (address, chain_id)
);
create index blockchain_links_user_idx on blockchain_links (user_id);

create table wallet_nonces (
  nonce       text primary key,
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz
);

create table digital_collectibles (
  id                uuid primary key default gen_random_uuid(),
  toy_instance_id   uuid not null references toy_instances(id),
  owner_user_id     uuid references users(id) on delete set null,
  kind              text not null default 'certificate' check (kind in ('certificate')),
  chain_id          int,
  contract_address  text,
  token_id          numeric(78,0),
  status            text not null default 'pending' check (status in ('pending', 'minted', 'failed')),
  tx_hash           text,
  metadata          jsonb not null default '{}'::jsonb,   -- public metadata only, never personal data or grades
  created_at        timestamptz not null default now(),
  unique (toy_instance_id, kind)
);

-- ───────────── Ops ─────────────
create table audit_logs (
  id           bigint generated always as identity primary key,
  actor_id     uuid references users(id) on delete set null,
  action       text not null,
  entity_type  text,
  entity_id    text,
  data         jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create index audit_logs_created_idx on audit_logs (created_at desc);
create index audit_logs_actor_idx on audit_logs (actor_id, created_at desc);

create table rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         int not null
);
