-- Local-only compatibility shim: stands in for Supabase-managed schemas so the
-- migrations can be applied against a vanilla PostgreSQL cluster in CI.
-- NOT applied on Supabase (which provides auth.* and storage.* natively).

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text
);
-- Supabase exposes auth.uid()/auth.role(); stub them for local runs.
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
create or replace function auth.role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon')
$$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);
