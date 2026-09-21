-- ============================================================================
-- LUMI — 0001 · Extensions & core enums
-- Target: PostgreSQL 16+ / Supabase.  See db/README.md for how to apply.
-- ============================================================================

-- 3. Required extensions -----------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "postgis";
create extension if not exists "pg_trgm";
create extension if not exists "btree_gist";

-- 4. Core enums --------------------------------------------------------------
create type user_role as enum (
  'customer', 'provider', 'company_manager', 'company_staff', 'admin', 'support'
);

create type account_status as enum (
  'pending', 'active', 'suspended', 'blocked', 'deleted'
);

create type verification_status as enum (
  'not_started', 'pending', 'approved', 'rejected', 'expired'
);

create type booking_status as enum (
  'draft', 'estimating', 'awaiting_payment_method', 'searching', 'offered',
  'accepted', 'provider_en_route', 'provider_arrived', 'in_progress',
  'awaiting_completion_confirmation', 'completed', 'cancelled', 'disputed',
  'refunded', 'expired'
);

create type booking_mode as enum (
  'scheduled', 'instant', 'flashclean', 'recurring', 'airbnb_automatic', 'corporate'
);

create type payment_status as enum (
  'pending', 'authorized', 'captured', 'partially_refunded', 'refunded', 'failed', 'cancelled'
);

create type payout_status as enum (
  'pending', 'processing', 'paid', 'failed', 'reversed'
);

create type message_type as enum (
  'text', 'image', 'video', 'voice', 'system', 'location'
);

create type media_type as enum (
  'image', 'video', 'document', 'voice'
);

create type photo_stage as enum (
  'booking_request', 'before_service', 'during_service', 'after_service', 'dispute'
);

create type dispute_status as enum (
  'opened', 'under_review', 'awaiting_customer', 'awaiting_provider',
  'resolved_customer', 'resolved_provider', 'partially_resolved', 'closed'
);

create type notification_channel as enum (
  'in_app', 'push', 'email', 'sms'
);

create type recurrence_frequency as enum (
  'weekly', 'biweekly', 'monthly', 'custom'
);
