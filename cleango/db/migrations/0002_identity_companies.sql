-- ============================================================================
-- LUMI — 0002 · Identity, profiles & companies
-- ============================================================================

-- 5.1 profiles (extends auth.users) -----------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null,
  status account_status not null default 'pending',
  first_name text,
  last_name text,
  display_name text,
  phone text,
  email text,
  avatar_url text,
  locale text not null default 'pl',
  timezone text not null default 'Europe/Warsaw',
  marketing_consent boolean not null default false,
  terms_accepted_at timestamptz,
  privacy_accepted_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index idx_profiles_role on profiles(role);
create index idx_profiles_status on profiles(status);
create unique index idx_profiles_phone_unique
  on profiles(phone) where phone is not null and deleted_at is null;

-- 5.2 customer_profiles ------------------------------------------------------
create table customer_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  default_property_id uuid,                 -- FK added after properties exist
  loyalty_points integer not null default 0,
  lifetime_value numeric(12,2) not null default 0,
  completed_bookings_count integer not null default 0,
  average_rating numeric(3,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5.3 provider_profiles ------------------------------------------------------
create table provider_profiles (
  user_id uuid primary key references profiles(id) on delete cascade,
  verification_status verification_status not null default 'not_started',
  pesel text,
  date_of_birth date,
  bio text,
  years_experience integer,
  has_vehicle boolean not null default false,
  has_professional_chemicals boolean not null default false,
  has_vacuum boolean not null default false,
  has_steam_cleaner boolean not null default false,
  has_window_equipment boolean not null default false,
  service_radius_km numeric(6,2) not null default 10,
  current_location geography(point,4326),
  online_status boolean not null default false,
  emergency_available boolean not null default false,
  average_rating numeric(3,2),
  rating_count integer not null default 0,
  completed_bookings_count integer not null default 0,
  cancellation_rate numeric(5,2) not null default 0,
  acceptance_rate numeric(5,2) not null default 0,
  level text not null default 'bronze',
  company_id uuid,                          -- FK added after companies exist
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_provider_profiles_location
  on provider_profiles using gist(current_location);

-- 5.4 provider_documents -----------------------------------------------------
create table provider_documents (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references provider_profiles(user_id) on delete cascade,
  document_type text not null,
  storage_path text not null,
  verification_status verification_status not null default 'pending',
  rejection_reason text,
  expires_at timestamptz,
  verified_by uuid references profiles(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5.5 provider_languages -----------------------------------------------------
create table provider_languages (
  provider_id uuid not null references provider_profiles(user_id) on delete cascade,
  language_code text not null,
  proficiency text not null default 'basic',
  primary key (provider_id, language_code)
);

-- 6.1 companies --------------------------------------------------------------
create table companies (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null,
  display_name text not null,
  nip text,
  regon text,
  krs text,
  billing_email text,
  phone text,
  logo_url text,
  status account_status not null default 'pending',
  verification_status verification_status not null default 'pending',
  stripe_account_id text,
  created_by uuid not null references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- 6.2 company_members --------------------------------------------------------
create table company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(company_id, user_id)
);

-- 6.3 company_service_areas --------------------------------------------------
create table company_service_areas (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  city text,
  postal_code_pattern text,
  polygon geography(polygon,4326),
  created_at timestamptz not null default now()
);

-- Deferred FK now that companies exists.
alter table provider_profiles
  add constraint fk_provider_company
  foreign key (company_id) references companies(id) on delete set null;
