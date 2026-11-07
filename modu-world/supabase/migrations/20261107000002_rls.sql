-- MODU WORLD — request context helpers, grants and Row Level Security.
--
-- The server opens a transaction per request and calls
--   select set_config('app.user_id', '<uuid>', true)
-- RLS policies below read that value. The runtime role (modu_app) is not the owner of the
-- tables, so every query it runs is filtered by these policies. Critical writes go through
-- SECURITY DEFINER functions (next migration) that validate permissions themselves.

create or replace function app.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app.has_role(r app_role) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from users where id = app.uid() and status = 'active' and r = any(roles))
$$;

create or replace function app.is_admin() returns boolean
language sql stable as $$ select app.has_role('admin') $$;

create or replace function app.is_guardian_of(child uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from parent_child_links where parent_id = app.uid() and child_id = child)
$$;

-- "may act on behalf of": the user themself, or a parent of a child account
create or replace function app.can_act_for(target uuid) returns boolean
language sql stable as $$
  select coalesce(target = app.uid(), false) or app.is_guardian_of(target)
$$;

create or replace function app.my_partner_id() returns uuid
language sql stable security definer set search_path = public as $$
  select partner_id from users where id = app.uid() and 'partner' = any(roles)
$$;

grant usage on schema public, app to modu_app;
grant execute on all functions in schema app to modu_app;
grant select, insert, update, delete on all tables in schema public to modu_app;
grant usage, select on all sequences in schema public to modu_app;

-- Secrets are never readable by the runtime role, not even by admins.
revoke select, insert, update on users from modu_app;
grant select (id, email, roles, partner_id, status, is_demo, created_at, deleted_at) on users to modu_app;
grant update (roles, status, partner_id) on users to modu_app;
revoke all on sessions, wallet_nonces, rate_limits from modu_app;
revoke select, insert, update on nfc_tags from modu_app;
grant select (id, toy_instance_id, public_token, tag_type, chip_uid, status, scan_count, last_scanned_at,
              failed_attempts, locked_until, activation_secret_issued_at, activation_secret_used_at, created_at)
  on nfc_tags to modu_app;
grant update (status, chip_uid, tag_type, locked_until, failed_attempts) on nfc_tags to modu_app;
-- Ledgers are append-only through functions.
revoke insert, update, delete on points_accounts, points_transactions, activations, ownership_transfers,
  reward_redemptions, coupons, achievement_reviews, blockchain_links, digital_collectibles from modu_app;
revoke update, delete on audit_logs from modu_app;

-- Supabase API roles (if present) get nothing: all data flows through the server.
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    execute 'revoke all on all tables in schema public from anon, authenticated';
  end if;
end $$;

-- Enable RLS everywhere
do $$ declare t text; begin
  foreach t in array array['partners','users','sessions','profiles','parent_child_links','characters','toy_batches',
    'toy_instances','nfc_tags','activations','ownership_transfers','school_achievements','achievement_reviews',
    'points_accounts','points_transactions','reward_catalog','reward_redemptions','coupons','blockchain_links',
    'wallet_nonces','digital_collectibles','audit_logs','rate_limits'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Public catalogue data
create policy characters_read on characters for select using (is_active or app.is_admin());
create policy characters_admin on characters for all using (app.is_admin()) with check (app.is_admin());
create policy partners_read on partners for select using (status = 'active' or app.is_admin());
create policy partners_admin on partners for all using (app.is_admin()) with check (app.is_admin());
create policy rewards_read on reward_catalog for select using (is_active or app.is_admin());
create policy rewards_admin on reward_catalog for all using (app.is_admin()) with check (app.is_admin());

-- Identity
create policy users_read on users for select using (app.can_act_for(id) or app.is_admin());
create policy users_admin_update on users for update using (app.is_admin()) with check (app.is_admin());
create policy profiles_read on profiles for select using (app.can_act_for(user_id) or app.is_admin());
create policy profiles_update on profiles for update using (app.can_act_for(user_id)) with check (app.can_act_for(user_id));
create policy links_read on parent_child_links for select using (parent_id = app.uid() or child_id = app.uid() or app.is_admin());

-- Toys
create policy batches_admin on toy_batches for all using (app.is_admin()) with check (app.is_admin());
create policy toys_read on toy_instances for select
  using (owner_user_id = app.uid() or (assigned_child_id is not null and app.is_guardian_of(assigned_child_id)) or app.is_admin());
create policy toys_assign on toy_instances for update using (owner_user_id = app.uid()) with check (owner_user_id = app.uid());
create policy toys_admin on toy_instances for update using (app.is_admin()) with check (app.is_admin());
create policy tags_read on nfc_tags for select
  using (app.is_admin() or exists (select 1 from toy_instances t where t.id = toy_instance_id and t.owner_user_id = app.uid()));
create policy tags_admin on nfc_tags for update using (app.is_admin()) with check (app.is_admin());
create policy activations_read on activations for select using (user_id = app.uid() or app.is_admin());
create policy transfers_read on ownership_transfers for select using (from_user_id = app.uid() or to_user_id = app.uid() or app.is_admin());

-- School: only the guardian (and admins reviewing) can see a child's achievements
create policy ach_read on school_achievements for select using (app.can_act_for(child_id) or app.is_admin());
create policy ach_delete on school_achievements for delete using (app.is_guardian_of(child_id));
create policy reviews_read on achievement_reviews for select using (app.is_admin() or exists (
  select 1 from school_achievements a where a.id = achievement_id and app.can_act_for(a.child_id)));

-- Points & rewards
create policy accounts_read on points_accounts for select using (app.can_act_for(user_id) or app.is_admin());
create policy ptx_read on points_transactions for select using (app.is_admin() or exists (
  select 1 from points_accounts a where a.id = account_id and app.can_act_for(a.user_id)));
create policy redemptions_read on reward_redemptions for select using (app.is_admin() or exists (
  select 1 from points_accounts a where a.id = account_id and app.can_act_for(a.user_id)));
create policy coupons_read on coupons for select using (app.is_admin()
  or (partner_id is not null and partner_id = app.my_partner_id())
  or exists (select 1 from reward_redemptions r join points_accounts a on a.id = r.account_id
             where r.id = redemption_id and app.can_act_for(a.user_id)));

-- Web3
create policy wallets_read on blockchain_links for select using (user_id = app.uid() or app.is_admin());
create policy wallets_delete on blockchain_links for delete using (user_id = app.uid());
create policy collectibles_read on digital_collectibles for select using (owner_user_id = app.uid() or app.is_admin());

-- Audit: anyone may append entries about themselves; only admins read
create policy audit_insert on audit_logs for insert with check (actor_id = app.uid());
create policy audit_read on audit_logs for select using (app.is_admin());
