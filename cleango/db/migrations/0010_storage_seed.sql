-- ============================================================================
-- LUMI — 0010 · Storage buckets (§21) & seed data (§29)
-- ============================================================================

-- 21. Storage buckets (private by default; access via signed URLs). ----------
insert into storage.buckets (id, name, public) values
  ('avatars','avatars', false),
  ('provider-documents','provider-documents', false),
  ('booking-photos','booking-photos', false),
  ('chat-media','chat-media', false),
  ('invoice-pdfs','invoice-pdfs', false),
  ('company-assets','company-assets', false),
  ('support-attachments','support-attachments', false),
  ('branding-assets','branding-assets', true)
on conflict (id) do nothing;

-- 29. Seed data --------------------------------------------------------------

-- Service categories (initial catalog — excludes car washing). ----------------
insert into service_categories (slug, name_key, icon_key, requires_photos) values
  ('apartment_cleaning','category.apartment_cleaning','home', true),
  ('house_cleaning','category.house_cleaning','home', true),
  ('office_cleaning','category.office_cleaning','office', false),
  ('airbnb_cleaning','category.airbnb_cleaning','airbnb', true),
  ('deep_cleaning','category.deep_cleaning','sparkle', true),
  ('regular_cleaning','category.regular_cleaning','broom', false),
  ('after_renovation','category.after_renovation','renovation', true),
  ('after_tenants','category.after_tenants','keys', true),
  ('window_cleaning','category.window_cleaning','window', false),
  ('furniture_cleaning','category.furniture_cleaning','sofa', true),
  ('mattress_cleaning','category.mattress_cleaning','bed', true),
  ('carpet_cleaning','category.carpet_cleaning','carpet', true),
  ('balcony_cleaning','category.balcony_cleaning','balcony', false),
  ('laundry','category.laundry','laundry', false),
  ('ironing','category.ironing','iron', false),
  ('garden_cleaning','category.garden_cleaning','garden', false),
  ('handyman','category.handyman','wrench', false),
  ('electrician','category.electrician','bolt', false),
  ('plumber','category.plumber','drop', false),
  ('furniture_assembly','category.furniture_assembly','tool', false),
  ('moving_assistance','category.moving_assistance','truck', false),
  ('home_maintenance','category.home_maintenance','gear', false)
on conflict (slug) do nothing;

-- A few representative service options for standard cleaning. ------------------
insert into service_options (category_id, code, name_key, option_type, price_effect_type, price_effect_value, sort_order)
select c.id, o.code, o.name_key, o.option_type, o.price_effect_type, o.price_effect_value, o.sort_order
from service_categories c
cross join (values
  ('inside_fridge','option.inside_fridge','addon','flat', 25, 1),
  ('inside_oven','option.inside_oven','addon','flat', 30, 2),
  ('interior_windows','option.interior_windows','addon','flat', 20, 3),
  ('laundry_ironing','option.laundry_ironing','addon','flat', 35, 4),
  ('balcony','option.balcony','addon','flat', 18, 5),
  ('pet_friendly','option.pet_friendly','addon','flat', 22, 6)
) as o(code, name_key, option_type, price_effect_type, price_effect_value, sort_order)
where c.slug in ('apartment_cleaning','house_cleaning','deep_cleaning','regular_cleaning')
on conflict (category_id, code) do nothing;

-- Subscription plans (LUMI+ for customers, Pro for providers). ----------------
insert into subscription_plans (code, audience, name_key, price, billing_interval, benefits) values
  ('lumi_plus','customer','plan.lumi_plus', 39, 'month',
     '{"discount_pct":10,"priority_dispatch":true,"favorite_provider":true,"smart_home_autopilot":true}'),
  ('provider_pro','provider','plan.provider_pro', 29, 'month',
     '{"reduced_platform_fee_pct":5,"priority_visibility":true,"advanced_analytics":true}')
on conflict (code) do nothing;

-- Reference / lookup seed (kept as simple key tables via jsonb-free rows). -----
-- Supported languages.
create table if not exists ref_languages (code text primary key, name text not null);
insert into ref_languages (code, name) values
  ('pl','Polski'), ('en','English'), ('uk','Українська'), ('ru','Русский')
on conflict (code) do nothing;

-- Provider levels.
create table if not exists ref_provider_levels (code text primary key, sort_order int not null);
insert into ref_provider_levels (code, sort_order) values
  ('bronze',1), ('silver',2), ('gold',3), ('platinum',4)
on conflict (code) do nothing;

-- Cancellation reasons.
create table if not exists ref_cancellation_reasons (code text primary key, label_key text not null);
insert into ref_cancellation_reasons (code, label_key) values
  ('customer_changed_mind','cancel.customer_changed_mind'),
  ('provider_no_show','cancel.provider_no_show'),
  ('property_inaccessible','cancel.property_inaccessible'),
  ('payment_failed','cancel.payment_failed'),
  ('no_provider_found','cancel.no_provider_found'),
  ('weather','cancel.weather')
on conflict (code) do nothing;

-- Dispute categories.
create table if not exists ref_dispute_categories (code text primary key, label_key text not null);
insert into ref_dispute_categories (code, label_key) values
  ('quality','dispute.quality'), ('damage','dispute.damage'),
  ('no_show','dispute.no_show'), ('overcharge','dispute.overcharge'),
  ('incomplete','dispute.incomplete')
on conflict (code) do nothing;

-- Notification templates.
create table if not exists notification_templates (
  key text primary key, title_key text not null, body_key text not null,
  default_channels notification_channel[] not null default '{in_app,push}'
);
insert into notification_templates (key, title_key, body_key, default_channels) values
  ('booking_accepted','notif.booking_accepted.title','notif.booking_accepted.body','{in_app,push}'),
  ('provider_en_route','notif.provider_en_route.title','notif.provider_en_route.body','{in_app,push}'),
  ('provider_arrived','notif.provider_arrived.title','notif.provider_arrived.body','{in_app,push}'),
  ('payment_captured','notif.payment_captured.title','notif.payment_captured.body','{in_app,email}'),
  ('review_reminder','notif.review_reminder.title','notif.review_reminder.body','{in_app,push}'),
  ('promo','notif.promo.title','notif.promo.body','{in_app,push,email}')
on conflict (key) do nothing;

-- Default pricing rule: FlashClean surge floor. -------------------------------
insert into pricing_rules (rule_type, condition_json, effect_json, priority) values
  ('surge', '{"mode":"flashclean"}', '{"min_multiplier":1.4}', 10)
on conflict do nothing;

-- Polish launch cities. -------------------------------------------------------
create table if not exists ref_cities (name text primary key, country_code char(2) not null default 'PL');
insert into ref_cities (name) values
  ('Warsaw'), ('Kraków'), ('Wrocław'), ('Poznań'), ('Gdańsk'), ('Łódź')
on conflict (name) do nothing;
