-- ============================================================================
-- LUMI — 0011 · Dispatch: server-side transition guard + atomic acceptance
-- Implements backend §9 (controlled transitions), §13 & §31 (atomic offer
-- acceptance — only one provider may win) and the §50 critical test.
-- ============================================================================

-- Server-enforced booking status machine ------------------------------------
-- Forbidden jumps (e.g. completed -> in_progress, searching -> completed) are
-- rejected in the database, not merely in the client.
create or replace function enforce_booking_transition()
returns trigger language plpgsql as $$
declare
  allowed text[] := array[
    'draft>estimating','draft>cancelled',
    'estimating>awaiting_payment_method','estimating>cancelled','estimating>expired',
    'awaiting_payment_method>searching','awaiting_payment_method>cancelled','awaiting_payment_method>expired',
    'searching>offered','searching>accepted','searching>cancelled','searching>expired',
    'offered>accepted','offered>searching','offered>cancelled','offered>expired',
    'accepted>provider_en_route','accepted>cancelled',
    'provider_en_route>provider_arrived','provider_en_route>cancelled',
    'provider_arrived>in_progress','provider_arrived>cancelled',
    'in_progress>awaiting_completion_confirmation','in_progress>disputed','in_progress>cancelled',
    'awaiting_completion_confirmation>completed','awaiting_completion_confirmation>disputed',
    'completed>disputed','completed>refunded',
    'disputed>completed','disputed>refunded','disputed>cancelled'
  ];
begin
  if new.status is distinct from old.status
     and not ((old.status::text || '>' || new.status::text) = any(allowed)) then
    raise exception 'BOOKING_TRANSITION_FORBIDDEN'
      using detail = format('%s -> %s', old.status, new.status),
            errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger trg_bookings_transition
  before update on bookings
  for each row execute function enforce_booking_transition();

-- Atomic offer acceptance (§31) ---------------------------------------------
-- Row-locks the booking so concurrent acceptances serialize: the first winner
-- flips it to 'accepted'; every later caller sees that and gets a stable
-- BOOKING_ALREADY_ACCEPTED error. All other offers are declined in the same
-- transaction, so there is never a duplicate assignment.
create or replace function accept_booking_offer(p_booking_id uuid, p_provider_id uuid)
returns bookings
language plpgsql
security definer
as $$
declare
  b bookings;
  o booking_offers;
begin
  select * into b from bookings where id = p_booking_id for update;   -- serialization point
  if not found then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if b.status not in ('searching', 'offered') then
    raise exception 'BOOKING_ALREADY_ACCEPTED'
      using detail = b.status::text, errcode = 'P0001';
  end if;

  -- If an explicit offer exists it must still be live.
  select * into o from booking_offers
    where booking_id = p_booking_id and provider_id = p_provider_id;
  if found and (o.accepted_at is not null or o.declined_at is not null or o.expires_at < now()) then
    raise exception 'OFFER_NOT_AVAILABLE' using errcode = 'P0003';
  end if;

  update bookings
    set provider_id = p_provider_id, status = 'accepted', accepted_at = now()
    where id = p_booking_id
    returning * into b;

  update booking_offers set accepted_at = now()
    where booking_id = p_booking_id and provider_id = p_provider_id;
  update booking_offers set declined_at = now(), decline_reason = 'accepted_by_other_provider'
    where booking_id = p_booking_id and provider_id <> p_provider_id
      and accepted_at is null and declined_at is null;

  return b;   -- conversation + status-history triggers fire on the status change
end $$;
