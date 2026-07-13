-- ============================================================================
-- LUMI — 0004 · Bookings, offers, recurrence & dispatch
-- ============================================================================

-- 9.1 bookings ---------------------------------------------------------------
-- SECURITY: platform_fee is never exposed in customer/provider client payloads.
-- Only secure server functions and authorized admins may read it (see views).
create table bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  property_id uuid not null references properties(id),
  service_category_id uuid not null references service_categories(id),
  provider_id uuid references provider_profiles(user_id),
  company_id uuid references companies(id),
  mode booking_mode not null,
  status booking_status not null default 'draft',
  scheduled_start timestamptz,
  scheduled_end timestamptz,
  estimated_duration_minutes integer,
  final_duration_minutes integer,
  customer_notes text,
  provider_notes text,
  ai_summary text,
  ai_confidence numeric(5,2),
  base_price numeric(12,2),
  surge_multiplier numeric(6,3) not null default 1,
  customer_total numeric(12,2),
  provider_gross numeric(12,2),
  platform_fee numeric(12,2),
  currency char(3) not null default 'PLN',
  search_radius_km numeric(6,2),
  cancellation_reason text,
  cancelled_by uuid references profiles(id),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_bookings_customer on bookings(customer_id, created_at desc);
create index idx_bookings_provider on bookings(provider_id, created_at desc);
create index idx_bookings_status on bookings(status);
create index idx_bookings_schedule on bookings(scheduled_start);
create index idx_bookings_search on bookings(status, mode, created_at);

-- 9.2 booking_options --------------------------------------------------------
create table booking_options (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  service_option_id uuid not null references service_options(id),
  value_json jsonb,
  price_delta numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

-- 9.3 booking_status_history -------------------------------------------------
create table booking_status_history (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  old_status booking_status,
  new_status booking_status not null,
  changed_by uuid references profiles(id),
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

-- 9.4 booking_offers ---------------------------------------------------------
create table booking_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  provider_id uuid not null references provider_profiles(user_id) on delete cascade,
  offered_price numeric(12,2) not null,
  estimated_distance_km numeric(8,2),
  estimated_arrival_minutes integer,
  expires_at timestamptz not null,
  viewed_at timestamptz,
  accepted_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  unique(booking_id, provider_id)
);
create index idx_booking_offers_provider on booking_offers(provider_id, created_at desc);

-- 9.5 recurring_booking_rules ------------------------------------------------
create table recurring_booking_rules (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references profiles(id),
  property_id uuid not null references properties(id),
  service_category_id uuid not null references service_categories(id),
  frequency recurrence_frequency not null,
  interval_value integer not null default 1,
  preferred_weekday integer,
  preferred_time time,
  preferred_provider_id uuid references provider_profiles(user_id),
  active boolean not null default true,
  next_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill FK on property_service_history.booking_id now that bookings exists.
alter table property_service_history
  add constraint fk_psh_booking
  foreign key (booking_id) references bookings(id) on delete set null;
alter table property_service_history
  add constraint fk_psh_category
  foreign key (service_category_id) references service_categories(id) on delete set null;

-- 10.1 provider_location_events (high volume — monthly range partitions) -----
create table provider_location_events (
  id bigint generated always as identity,
  provider_id uuid not null references provider_profiles(user_id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  location geography(point,4326) not null,
  accuracy_meters numeric(8,2),
  heading numeric(6,2),
  speed_mps numeric(8,2),
  recorded_at timestamptz not null default now(),
  primary key(id, recorded_at)
) partition by range(recorded_at);
-- A default partition keeps inserts working; a scheduled job rolls monthly ones.
create table provider_location_events_default
  partition of provider_location_events default;

-- 10.2 dispatch_rounds -------------------------------------------------------
create table dispatch_rounds (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  round_number integer not null,
  radius_km numeric(6,2) not null,
  surge_multiplier numeric(6,3) not null,
  candidate_count integer not null default 0,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

-- 10.3 provider_availability -------------------------------------------------
create table provider_availability (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(user_id) on delete cascade,
  weekday integer not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  is_active boolean not null default true,
  unique(provider_id, weekday, start_time, end_time)
);
