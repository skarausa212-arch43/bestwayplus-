-- ============================================================================
-- LUMI — 0008 · Functions & triggers (section 25)
-- Heavy AI / third-party work stays out of triggers; triggers only maintain
-- derived state and enqueue async work.
-- ============================================================================

-- updated_at maintenance -----------------------------------------------------
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'profiles','customer_profiles','provider_profiles','provider_documents',
    'companies','properties','service_categories','bookings',
    'recurring_booking_rules','payments','disputes','support_tickets',
    'subscriptions','external_integrations','calendar_events','organizations'
  ] loop
    execute format(
      'create trigger trg_%1$s_updated_at before update on %1$s
         for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- Log booking status transitions --------------------------------------------
create or replace function log_booking_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into booking_status_history(booking_id, old_status, new_status, changed_by)
    values (new.id, old.status, new.status, new.cancelled_by);
  end if;
  return new;
end $$;
create trigger trg_bookings_status_history
  after update on bookings
  for each row execute function log_booking_status();

-- Create a conversation + members when a booking is accepted -----------------
create or replace function ensure_booking_conversation()
returns trigger language plpgsql as $$
declare conv_id uuid;
begin
  if new.status = 'accepted' and (old.status is distinct from new.status)
     and new.provider_id is not null then
    insert into conversations(booking_id) values (new.id)
      on conflict (booking_id) do nothing
      returning id into conv_id;
    if conv_id is null then
      select id into conv_id from conversations where booking_id = new.id;
    end if;
    insert into conversation_members(conversation_id, user_id)
      values (conv_id, new.customer_id), (conv_id, new.provider_id)
      on conflict do nothing;
  end if;
  return new;
end $$;
create trigger trg_bookings_conversation
  after update on bookings
  for each row execute function ensure_booking_conversation();

-- Update provider + customer stats and service history on completion ---------
create or replace function on_booking_completed()
returns trigger language plpgsql as $$
begin
  if new.status = 'completed' and (old.status is distinct from new.status) then
    if new.provider_id is not null then
      update provider_profiles
        set completed_bookings_count = completed_bookings_count + 1
        where user_id = new.provider_id;
    end if;
    update customer_profiles
      set completed_bookings_count = completed_bookings_count + 1
      where user_id = new.customer_id;
    insert into property_service_history(property_id, service_category_id, booking_id, performed_at, quality_score)
      values (new.property_id, new.service_category_id, new.id, coalesce(new.completed_at, now()), null);
  end if;
  return new;
end $$;
create trigger trg_bookings_completed
  after update on bookings
  for each row execute function on_booking_completed();

-- Lifetime value after payment capture ---------------------------------------
create or replace function on_payment_captured()
returns trigger language plpgsql as $$
begin
  if new.status = 'captured' and (old.status is distinct from new.status) then
    update customer_profiles
      set lifetime_value = lifetime_value + coalesce(new.amount_captured, 0)
      where user_id = new.customer_id;
    -- NOTE: invoice generation is enqueued asynchronously (see §26 queues),
    -- never generated inside this trigger.
  end if;
  return new;
end $$;
create trigger trg_payments_captured
  after update on payments
  for each row execute function on_payment_captured();

-- Recalculate provider rating after a review ---------------------------------
create or replace function recalc_provider_rating()
returns trigger language plpgsql as $$
declare avg_rating numeric(3,2); cnt integer;
begin
  select round(avg(overall_rating),2), count(*) into avg_rating, cnt
    from reviews where reviewee_id = new.reviewee_id;
  update provider_profiles
    set average_rating = avg_rating, rating_count = cnt
    where user_id = new.reviewee_id;
  return new;
end $$;
create trigger trg_reviews_recalc_rating
  after insert on reviews
  for each row execute function recalc_provider_rating();

-- Maintain wallet balance after a wallet transaction -------------------------
create or replace function apply_wallet_transaction()
returns trigger language plpgsql as $$
declare new_balance numeric(12,2);
begin
  insert into provider_wallets(provider_id) values (new.provider_id)
    on conflict (provider_id) do nothing;
  update provider_wallets
    set available_balance = available_balance + new.amount, updated_at = now()
    where provider_id = new.provider_id
    returning available_balance into new_balance;
  new.balance_after = new_balance;
  return new;
end $$;
create trigger trg_wallet_tx_apply
  before insert on wallet_transactions
  for each row execute function apply_wallet_transaction();
