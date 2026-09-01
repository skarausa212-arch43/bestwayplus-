-- ============================================================================
-- LUMI — 0003 · Properties, Family Home & service catalog
-- ============================================================================

-- 7.1 properties -------------------------------------------------------------
create table properties (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  name text not null,
  property_type text not null,
  address_line_1 text not null,
  address_line_2 text,
  city text not null,
  postal_code text not null,
  country_code char(2) not null default 'PL',
  location geography(point,4326),
  floor integer,
  has_elevator boolean,
  has_parking boolean,
  area_sqm numeric(8,2),
  rooms_count integer,
  bathrooms_count integer,
  has_pets boolean not null default false,
  access_notes text,
  lumi_score integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_properties_owner on properties(owner_id) where deleted_at is null;
create index idx_properties_location on properties using gist(location);

-- Deferred FK from customer_profiles now that properties exists.
alter table customer_profiles
  add constraint fk_customer_default_property
  foreign key (default_property_id) references properties(id) on delete set null;

-- 7.2 property_members (Family Home permissions) -----------------------------
create table property_members (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  member_role text not null,
  can_view boolean not null default true,
  can_book boolean not null default false,
  can_pay boolean not null default false,
  can_manage boolean not null default false,
  created_at timestamptz not null default now(),
  unique(property_id, user_id)
);

-- 7.3 property_service_history (feeds Smart Home + LUMI Score) ---------------
create table property_service_history (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references properties(id) on delete cascade,
  service_category_id uuid,
  booking_id uuid,
  performed_at timestamptz not null,
  next_recommended_at timestamptz,
  quality_score numeric(5,2),
  notes text,
  created_at timestamptz not null default now()
);
create index idx_property_service_history_property
  on property_service_history(property_id, performed_at desc);

-- 8.1 service_categories -----------------------------------------------------
create table service_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references service_categories(id),
  slug text not null unique,
  name_key text not null,
  description_key text,
  icon_key text,
  is_active boolean not null default true,
  supports_instant boolean not null default true,
  supports_scheduled boolean not null default true,
  supports_recurring boolean not null default true,
  requires_photos boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8.2 service_options --------------------------------------------------------
create table service_options (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references service_categories(id) on delete cascade,
  code text not null,
  name_key text not null,
  option_type text not null,
  price_effect_type text,
  price_effect_value numeric(12,2),
  is_required boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(category_id, code)
);

-- 8.3 provider_services ------------------------------------------------------
create table provider_services (
  provider_id uuid not null references provider_profiles(user_id) on delete cascade,
  category_id uuid not null references service_categories(id) on delete cascade,
  base_rate numeric(12,2),
  is_active boolean not null default true,
  experience_level text,
  primary key(provider_id, category_id)
);
