-- Smoke test: exercises FKs, the booking lifecycle and the triggers end to end,
-- then asserts the derived state is correct. Run by db/verify.sh.
do $$
declare
  cust uuid := gen_random_uuid();
  prov uuid := gen_random_uuid();
  prop uuid;
  cat  uuid;
  bk   uuid;
  conv uuid;
begin
  insert into auth.users(id) values (cust), (prov);
  insert into profiles(id, role) values (cust, 'customer'), (prov, 'provider');
  insert into customer_profiles(user_id) values (cust);
  insert into provider_profiles(user_id) values (prov);

  select id into cat from service_categories where slug = 'apartment_cleaning';

  insert into properties(owner_id, name, property_type, address_line_1, city, postal_code)
    values (cust, 'Home', 'apartment', 'ul. Test 1', 'Warsaw', '00-001')
    returning id into prop;

  insert into bookings(customer_id, property_id, service_category_id, provider_id,
                       mode, status, customer_total, provider_gross, platform_fee)
    values (cust, prop, cat, prov, 'instant', 'searching', 200, 160, 40)
    returning id into bk;

  -- Full valid lifecycle — every step is a transition the state machine allows.
  update bookings set status = 'accepted' where id = bk;   -- conversation + status history
  update bookings set status = 'provider_en_route' where id = bk;
  update bookings set status = 'provider_arrived' where id = bk;
  update bookings set status = 'in_progress' where id = bk;
  update bookings set status = 'awaiting_completion_confirmation' where id = bk;
  update bookings set status = 'completed', completed_at = now() where id = bk;  -- stats + service history

  -- The state machine must reject an illegal jump.
  begin
    update bookings set status = 'in_progress' where id = bk;
    raise exception 'guard-failed: completed -> in_progress should be rejected';
  exception when others then
    assert sqlerrm like 'BOOKING_TRANSITION_FORBIDDEN%', 'unexpected error: ' || sqlerrm;
  end;

  insert into wallet_transactions(provider_id, booking_id, type, amount)
    values (prov, bk, 'payout', 160);                                       -- wallet balance trigger

  insert into reviews(booking_id, reviewer_id, reviewee_id,
                      quality_rating, punctuality_rating, communication_rating,
                      professionalism_rating, overall_rating)
    values (bk, cust, prov, 5, 4, 5, 4, 4.5);                               -- rating recompute

  -- Assertions ---------------------------------------------------------------
  assert (select count(*) from booking_status_history where booking_id = bk) >= 2,
    'expected >=2 status-history rows';
  select id into conv from conversations where booking_id = bk;
  assert conv is not null, 'conversation should be created on acceptance';
  assert (select count(*) from conversation_members where conversation_id = conv) = 2,
    'conversation should have 2 members';
  assert (select completed_bookings_count from provider_profiles where user_id = prov) = 1,
    'provider completed count should be 1';
  assert (select completed_bookings_count from customer_profiles where user_id = cust) = 1,
    'customer completed count should be 1';
  assert (select available_balance from provider_wallets where provider_id = prov) = 160,
    'wallet balance should be 160';
  assert (select balance_after from wallet_transactions where booking_id = bk) = 160,
    'wallet_transaction balance_after should be stamped to 160';
  assert (select average_rating from provider_profiles where user_id = prov) = 4.50,
    'provider rating should be 4.50';
  assert (select count(*) from property_service_history where booking_id = bk) = 1,
    'service history row should be created on completion';

  -- Secure views must not leak platform_fee to customer/provider payloads.
  assert (select count(*) from information_schema.columns
          where table_name = 'customer_booking_view' and column_name = 'platform_fee') = 0,
    'customer_booking_view must not expose platform_fee';
  assert (select count(*) from information_schema.columns
          where table_name = 'provider_booking_view' and column_name = 'platform_fee') = 0,
    'provider_booking_view must not expose platform_fee';
  assert (select count(*) from information_schema.columns
          where table_name = 'admin_financial_view' and column_name = 'platform_fee') = 1,
    'admin_financial_view should expose platform_fee';

  raise notice 'SMOKE OK — % tables', (select count(*) from information_schema.tables where table_schema='public');
end $$;
