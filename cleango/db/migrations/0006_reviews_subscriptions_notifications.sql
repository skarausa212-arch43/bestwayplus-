-- ============================================================================
-- LUMI — 0006 · Reviews, disputes, subscriptions, promotions & notifications
-- ============================================================================

-- 14.1 reviews ---------------------------------------------------------------
create table reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references bookings(id),
  reviewer_id uuid not null references profiles(id),
  reviewee_id uuid not null references profiles(id),
  quality_rating integer check (quality_rating between 1 and 5),
  punctuality_rating integer check (punctuality_rating between 1 and 5),
  communication_rating integer check (communication_rating between 1 and 5),
  professionalism_rating integer check (professionalism_rating between 1 and 5),
  overall_rating numeric(3,2) not null,
  comment text,
  is_public boolean not null default true,
  moderation_status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index idx_reviews_reviewee on reviews(reviewee_id);

-- 14.2 provider_quality_metrics ----------------------------------------------
create table provider_quality_metrics (
  provider_id uuid primary key references provider_profiles(user_id) on delete cascade,
  last_30_days_rating numeric(3,2),
  last_90_days_rating numeric(3,2),
  punctuality_score numeric(5,2),
  photo_compliance_score numeric(5,2),
  dispute_rate numeric(5,2),
  repeat_customer_rate numeric(5,2),
  updated_at timestamptz not null default now()
);

-- 15.1 disputes --------------------------------------------------------------
create table disputes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id),
  opened_by uuid not null references profiles(id),
  status dispute_status not null default 'opened',
  category text not null,
  description text not null,
  requested_refund numeric(12,2),
  resolution_notes text,
  resolved_by uuid references profiles(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 15.2 support_tickets -------------------------------------------------------
create table support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id),
  booking_id uuid references bookings(id),
  subject text not null,
  description text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  assigned_to uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 16.1 subscription_plans ----------------------------------------------------
create table subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  audience text not null,
  name_key text not null,
  price numeric(12,2) not null,
  currency char(3) not null default 'PLN',
  billing_interval text not null,
  benefits jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 16.2 subscriptions ---------------------------------------------------------
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id),
  company_id uuid references companies(id),
  plan_id uuid not null references subscription_plans(id),
  provider_subscription_id text,
  status text not null,
  starts_at timestamptz not null,
  renews_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 16.3 promo_codes -----------------------------------------------------------
create table promo_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null,
  discount_value numeric(12,2) not null,
  max_redemptions integer,
  per_user_limit integer not null default 1,
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 16.4 promo_redemptions -----------------------------------------------------
create table promo_redemptions (
  id uuid primary key default gen_random_uuid(),
  promo_code_id uuid not null references promo_codes(id),
  user_id uuid not null references profiles(id),
  booking_id uuid references bookings(id),
  discount_amount numeric(12,2) not null,
  redeemed_at timestamptz not null default now()
);

-- 16.5 referrals -------------------------------------------------------------
create table referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references profiles(id),
  referred_user_id uuid references profiles(id),
  referral_code text not null,
  status text not null default 'invited',
  reward_amount numeric(12,2),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

-- 17.1 notifications ---------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  title_key text not null,
  body_key text not null,
  payload jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index idx_notifications_user on notifications(user_id, created_at desc);

-- 17.2 notification_deliveries -----------------------------------------------
create table notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references notifications(id) on delete cascade,
  channel notification_channel not null,
  provider_message_id text,
  status text not null,
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text
);

-- 17.3 device_tokens ---------------------------------------------------------
create table device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  token text not null unique,
  platform text not null,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
