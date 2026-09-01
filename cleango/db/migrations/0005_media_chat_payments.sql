-- ============================================================================
-- LUMI — 0005 · Media evidence, chat, payments, wallets & payouts
-- ============================================================================

-- 11.1 media_assets ----------------------------------------------------------
create table media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  booking_id uuid references bookings(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  type media_type not null,
  stage photo_stage,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  size_bytes bigint,
  checksum text,
  width integer,
  height integer,
  duration_seconds integer,
  metadata jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_media_booking on media_assets(booking_id);
create index idx_media_property on media_assets(property_id);

-- 11.2 ai_media_analyses -----------------------------------------------------
create table ai_media_analyses (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references media_assets(id) on delete cascade,
  model_name text not null,
  model_version text,
  analysis_type text not null,
  result jsonb not null,
  confidence numeric(5,2),
  created_at timestamptz not null default now()
);

-- 12.1 conversations ---------------------------------------------------------
create table conversations (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique references bookings(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 12.2 conversation_members --------------------------------------------------
create table conversation_members (
  conversation_id uuid not null references conversations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  last_read_at timestamptz,
  muted_until timestamptz,
  primary key(conversation_id, user_id)
);

-- 12.3 messages --------------------------------------------------------------
create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender_id uuid references profiles(id),
  type message_type not null,
  body text,
  media_id uuid references media_assets(id),
  translated_body jsonb,
  reply_to_id uuid references messages(id),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_messages_conversation on messages(conversation_id, created_at);

-- 13.1 payment_methods -------------------------------------------------------
create table payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  provider text not null,
  provider_payment_method_id text not null,
  brand text,
  last4 text,
  exp_month integer,
  exp_year integer,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 13.2 payments --------------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  customer_id uuid not null references profiles(id),
  status payment_status not null default 'pending',
  provider_name text not null default 'stripe',
  payment_intent_id text,
  amount_authorized numeric(12,2),
  amount_captured numeric(12,2),
  amount_refunded numeric(12,2) not null default 0,
  currency char(3) not null default 'PLN',
  failure_code text,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_payments_booking on payments(booking_id);

-- 13.3 provider_wallets ------------------------------------------------------
create table provider_wallets (
  provider_id uuid primary key references provider_profiles(user_id) on delete cascade,
  available_balance numeric(12,2) not null default 0,
  pending_balance numeric(12,2) not null default 0,
  currency char(3) not null default 'PLN',
  updated_at timestamptz not null default now()
);

-- 13.4 wallet_transactions ---------------------------------------------------
create table wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(user_id),
  booking_id uuid references bookings(id),
  type text not null,
  amount numeric(12,2) not null,
  balance_after numeric(12,2),
  description text,
  created_at timestamptz not null default now()
);
create index idx_wallet_tx_provider on wallet_transactions(provider_id, created_at desc);

-- 13.5 payouts ---------------------------------------------------------------
create table payouts (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(user_id),
  company_id uuid references companies(id),
  amount numeric(12,2) not null,
  currency char(3) not null default 'PLN',
  status payout_status not null default 'pending',
  stripe_transfer_id text,
  initiated_at timestamptz,
  paid_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now()
);

-- 13.6 invoices --------------------------------------------------------------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references bookings(id),
  customer_id uuid references profiles(id),
  company_id uuid references companies(id),
  invoice_number text not null unique,
  issuer_type text not null,
  subtotal numeric(12,2) not null,
  tax_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null,
  currency char(3) not null default 'PLN',
  pdf_storage_path text,
  issued_at timestamptz not null,
  created_at timestamptz not null default now()
);
