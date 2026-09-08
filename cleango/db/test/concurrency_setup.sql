-- Fixture for the §50 critical test: one searchable booking, two providers,
-- each with a live offer. verify.sh then fires two acceptances in parallel.
insert into auth.users(id) values
  ('00000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');
insert into profiles(id, role) values
  ('00000000-0000-0000-0000-0000000000c1','customer'),
  ('00000000-0000-0000-0000-0000000000a1','provider'),
  ('00000000-0000-0000-0000-0000000000a2','provider');
insert into customer_profiles(user_id) values ('00000000-0000-0000-0000-0000000000c1');
insert into provider_profiles(user_id) values
  ('00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000a2');
insert into properties(id, owner_id, name, property_type, address_line_1, city, postal_code)
  values ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1',
          'Race flat','apartment','ul. Race 1','Warsaw','00-002');
insert into bookings(id, customer_id, property_id, service_category_id, mode, status,
                     customer_total, provider_gross, platform_fee)
  select '00000000-0000-0000-0000-0000000000bb',
         '00000000-0000-0000-0000-0000000000c1',
         '00000000-0000-0000-0000-0000000000d1',
         (select id from service_categories where slug = 'apartment_cleaning'),
         'instant','searching',200,160,40;
insert into booking_offers(booking_id, provider_id, offered_price, expires_at) values
  ('00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-0000000000a1',160, now() + interval '5 min'),
  ('00000000-0000-0000-0000-0000000000bb','00000000-0000-0000-0000-0000000000a2',160, now() + interval '5 min');
