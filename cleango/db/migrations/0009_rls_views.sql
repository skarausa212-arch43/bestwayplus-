-- ============================================================================
-- LUMI — 0009 · Row Level Security (§22) & secure views (§23)
-- Column-level protection (e.g. platform_fee) is done with views + RPC, not
-- by trusting the client. RLS here restricts which ROWS each actor can see.
-- ============================================================================

-- Helper: is the current user an admin/support staff member?
create or replace function is_staff()
returns boolean language sql stable as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('admin','support')
  );
$$;

-- Helper: can the current user access a property (owner or member)?
create or replace function can_access_property(p_id uuid)
returns boolean language sql stable as $$
  select exists (select 1 from properties where id = p_id and owner_id = auth.uid())
      or exists (select 1 from property_members
                 where property_id = p_id and user_id = auth.uid() and can_view);
$$;

-- profiles -------------------------------------------------------------------
alter table profiles enable row level security;
create policy profiles_self_read on profiles
  for select using (id = auth.uid() or is_staff());
create policy profiles_self_update on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- Public provider fields are read via public_provider_view (below), not here.

-- customer_profiles ----------------------------------------------------------
alter table customer_profiles enable row level security;
create policy customer_self on customer_profiles
  for all using (user_id = auth.uid() or is_staff()) with check (user_id = auth.uid());

-- provider_profiles ----------------------------------------------------------
alter table provider_profiles enable row level security;
create policy provider_self on provider_profiles
  for all using (user_id = auth.uid() or is_staff()) with check (user_id = auth.uid());

-- properties -----------------------------------------------------------------
alter table properties enable row level security;
create policy properties_owner_all on properties
  for all using (owner_id = auth.uid() or is_staff()) with check (owner_id = auth.uid());
create policy properties_member_read on properties
  for select using (
    exists (select 1 from property_members m
            where m.property_id = properties.id and m.user_id = auth.uid() and m.can_view));

-- property_members -----------------------------------------------------------
alter table property_members enable row level security;
create policy property_members_visible on property_members
  for select using (user_id = auth.uid() or can_access_property(property_id) or is_staff());
create policy property_members_manage on property_members
  for all using (
    exists (select 1 from properties p where p.id = property_id and p.owner_id = auth.uid()))
  with check (
    exists (select 1 from properties p where p.id = property_id and p.owner_id = auth.uid()));

-- bookings -------------------------------------------------------------------
alter table bookings enable row level security;
create policy bookings_customer on bookings
  for select using (customer_id = auth.uid() or is_staff());
create policy bookings_provider on bookings
  for select using (
    provider_id = auth.uid()
    or exists (select 1 from booking_offers o
               where o.booking_id = bookings.id and o.provider_id = auth.uid()));
create policy bookings_customer_write on bookings
  for update using (customer_id = auth.uid()) with check (customer_id = auth.uid());

-- messages -------------------------------------------------------------------
alter table conversations enable row level security;
alter table conversation_members enable row level security;
alter table messages enable row level security;
create policy conversations_members_read on conversations
  for select using (
    exists (select 1 from conversation_members cm
            where cm.conversation_id = conversations.id and cm.user_id = auth.uid()));
create policy conv_members_self on conversation_members
  for select using (user_id = auth.uid());
create policy messages_members_read on messages
  for select using (
    exists (select 1 from conversation_members cm
            where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()));
create policy messages_members_insert on messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from conversation_members cm
                where cm.conversation_id = messages.conversation_id and cm.user_id = auth.uid()));

-- payments (customers see only their own; fee internals stay server-side) -----
alter table payments enable row level security;
create policy payments_customer on payments
  for select using (customer_id = auth.uid() or is_staff());

-- reviews (public reviews readable; author manages own) ----------------------
alter table reviews enable row level security;
create policy reviews_read on reviews
  for select using (is_public or reviewer_id = auth.uid() or reviewee_id = auth.uid() or is_staff());
create policy reviews_author_write on reviews
  for insert with check (reviewer_id = auth.uid());

-- notifications / device tokens ---------------------------------------------
alter table notifications enable row level security;
create policy notifications_self on notifications
  for select using (user_id = auth.uid());
alter table device_tokens enable row level security;
create policy device_tokens_self on device_tokens
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 23. Secure views — exclude commission, fraud/risk scores, internal notes,
-- confidential docs and other providers' offers from client-facing payloads.
-- ---------------------------------------------------------------------------

create view customer_booking_view as
select id, customer_id, property_id, service_category_id, provider_id, company_id,
       mode, status, scheduled_start, scheduled_end, estimated_duration_minutes,
       final_duration_minutes, customer_notes, ai_summary,
       customer_total, currency, cancellation_reason,
       accepted_at, started_at, completed_at, created_at, updated_at
from bookings;   -- deliberately omits platform_fee, provider_gross, surge, ai_confidence

create view provider_booking_view as
select id, property_id, service_category_id, provider_id, company_id,
       mode, status, scheduled_start, scheduled_end, estimated_duration_minutes,
       final_duration_minutes, provider_notes,
       provider_gross, currency, search_radius_km,
       accepted_at, started_at, completed_at, created_at, updated_at
from bookings;   -- omits platform_fee, customer_total, customer_notes

create view company_booking_view as
select id, company_id, provider_id, property_id, service_category_id,
       status, scheduled_start, scheduled_end, provider_gross, currency,
       created_at, completed_at
from bookings;

create view public_provider_view as
select user_id, bio, years_experience, service_radius_km, online_status,
       emergency_available, average_rating, rating_count,
       completed_bookings_count, level
from provider_profiles;   -- omits pesel, date_of_birth, location, internal rates

create view admin_financial_view as
select id, customer_id, provider_id, company_id, status,
       base_price, surge_multiplier, customer_total, provider_gross,
       platform_fee, currency, created_at, completed_at
from bookings;   -- full financials — reachable only through admin (service-role) endpoints
