-- ============================================================================
-- LUMI — 0007 · AI & pricing, Airbnb/corporate integrations, audit & security
-- ============================================================================

-- 18.1 ai_estimates ----------------------------------------------------------
create table ai_estimates (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  model_name text not null,
  model_version text,
  estimated_duration_minutes integer,
  estimated_workers integer,
  recommended_price numeric(12,2),
  difficulty_score numeric(5,2),
  risk_score numeric(5,2),
  confidence numeric(5,2),
  suggested_services jsonb,
  raw_output jsonb,
  created_at timestamptz not null default now()
);

-- 18.2 pricing_rules ---------------------------------------------------------
create table pricing_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references service_categories(id),
  city text,
  rule_type text not null,
  condition_json jsonb not null,
  effect_json jsonb not null,
  priority integer not null default 100,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 18.3 demand_snapshots ------------------------------------------------------
create table demand_snapshots (
  id bigint generated always as identity primary key,
  city text not null,
  area_geohash text not null,
  category_id uuid references service_categories(id),
  demand_score numeric(8,4) not null,
  active_provider_count integer not null,
  open_booking_count integer not null,
  calculated_at timestamptz not null default now()
);

-- 19.1 external_integrations (Airbnb, etc.) ----------------------------------
create table external_integrations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  property_id uuid references properties(id),
  provider_name text not null,
  encrypted_credentials jsonb,
  status text not null default 'active',
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 19.2 calendar_events -------------------------------------------------------
create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references external_integrations(id) on delete cascade,
  external_event_id text not null,
  property_id uuid not null references properties(id),
  event_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  raw_payload jsonb,
  booking_id uuid references bookings(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(integration_id, external_event_id)
);

-- 19.3 organizations ---------------------------------------------------------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  billing_email text,
  nip text,
  status account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 19.4 organization_members --------------------------------------------------
create table organization_members (
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null,
  primary key(organization_id, user_id)
);

-- 19.5 organization_properties -----------------------------------------------
create table organization_properties (
  organization_id uuid not null references organizations(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  primary key(organization_id, property_id)
);

-- 20.1 audit_logs (append-only) ----------------------------------------------
create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references profiles(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  old_values jsonb,
  new_values jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- 20.2 admin_actions ---------------------------------------------------------
create table admin_actions (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references profiles(id),
  action_type text not null,
  target_type text not null,
  target_id uuid,
  reason text,
  metadata jsonb,
  created_at timestamptz not null default now()
);
