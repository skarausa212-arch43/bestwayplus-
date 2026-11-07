-- MODU WORLD — atomic business operations.
-- Every function runs in the caller's transaction, takes row locks where state changes,
-- reads the acting user from app.uid() (never from a parameter) and returns
-- jsonb {ok: true, ...} or {ok: false, error: 'CODE'}.

create or replace function app.err(code text) returns jsonb language sql immutable as $$
  select jsonb_build_object('ok', false, 'error', code)
$$;

create or replace function app.audit(p_action text, p_entity_type text, p_entity_id text, p_data jsonb default '{}')
returns void language sql security definer set search_path = public as $$
  insert into audit_logs (actor_id, action, entity_type, entity_id, data)
  values (app.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_data, '{}'::jsonb));
$$;

-- ───────────── Rate limiting (fixed window, works across server instances) ─────────────
create or replace function app.rate_hit(p_key text, p_limit int, p_window_seconds int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into rate_limits as r (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
    window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;

-- ───────────── Auth ─────────────
create or replace function app.ensure_points_account(p_user uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into points_accounts (user_id) values (p_user) on conflict (user_id) do nothing;
  select id into v_id from points_accounts where user_id = p_user;
  return v_id;
end $$;

create or replace function app.register_user(p_email text, p_password_hash text, p_display_name text, p_birth_year int, p_locale text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if exists (select 1 from users where lower(email) = lower(p_email)) then return app.err('EMAIL_TAKEN'); end if;
  insert into users (email, password_hash, roles) values (lower(p_email), p_password_hash, '{parent}') returning id into v_id;
  insert into profiles (user_id, display_name, birth_year, locale, terms_accepted_at)
  values (v_id, p_display_name, p_birth_year, coalesce(p_locale, 'ru'), now());
  perform app.ensure_points_account(v_id);
  insert into audit_logs (actor_id, action, entity_type, entity_id) values (v_id, 'user.register', 'user', v_id::text);
  return jsonb_build_object('ok', true, 'user_id', v_id);
exception when unique_violation then
  return app.err('EMAIL_TAKEN');
end $$;

create or replace function app.auth_lookup(p_email text)
returns table (id uuid, password_hash text, status text)
language sql stable security definer set search_path = public as $$
  select id, password_hash, status from users where lower(email) = lower(p_email) and password_hash is not null
$$;

create or replace function app.session_create(p_user uuid, p_token_hash text, p_ttl_hours int, p_user_agent text)
returns void language sql security definer set search_path = public as $$
  delete from sessions where user_id = p_user and expires_at < now();
  insert into sessions (user_id, token_hash, expires_at, user_agent)
  values (p_user, p_token_hash, now() + make_interval(hours => p_ttl_hours), left(p_user_agent, 200));
$$;

create or replace function app.session_get(p_token_hash text) returns uuid
language sql stable security definer set search_path = public as $$
  select s.user_id from sessions s join users u on u.id = s.user_id
  where s.token_hash = p_token_hash and s.expires_at > now() and u.status = 'active'
$$;

create or replace function app.session_delete(p_token_hash text) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token_hash = p_token_hash
$$;

-- Parent creates a managed child profile (no email, no password, explicit consent recorded)
create or replace function app.create_child(p_display_name text, p_birth_year int, p_consent_version text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_parent uuid := app.uid(); v_child uuid;
begin
  if v_parent is null or not app.has_role('parent') then return app.err('FORBIDDEN'); end if;
  if (select count(*) from parent_child_links where parent_id = v_parent) >= 6 then return app.err('LIMIT_REACHED'); end if;
  insert into users (roles, is_demo) select '{child}', is_demo from users where id = v_parent returning id into v_child;
  insert into profiles (user_id, display_name, birth_year, locale)
  select v_child, p_display_name, p_birth_year, locale from profiles where user_id = v_parent;
  insert into parent_child_links (parent_id, child_id, consent_given_at, consent_version) values (v_parent, v_child, now(), p_consent_version);
  perform app.ensure_points_account(v_child);
  perform app.audit('child.create', 'user', v_child::text, jsonb_build_object('consent_version', p_consent_version));
  return jsonb_build_object('ok', true, 'child_id', v_child);
end $$;

-- Self-declared adult access for the Collectors / MODU Coin area. Real KYC is an external integration.
create or replace function app.attest_adult(p_birth_date date) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := app.uid();
begin
  if v_user is null then return app.err('UNAUTHENTICATED'); end if;
  if app.has_role('child') then return app.err('FORBIDDEN'); end if;
  if p_birth_date is null or p_birth_date > (current_date - interval '18 years')::date then return app.err('UNDERAGE'); end if;
  -- the full date is only used for this check; only the year is stored
  update profiles set birth_year = extract(year from p_birth_date)::int, adult_attested_at = now(), updated_at = now()
    where user_id = v_user;
  update users set roles = array(select distinct unnest(roles || '{collector}'::app_role[])) where id = v_user;
  perform app.audit('user.adult_attested', 'user', v_user::text);
  return jsonb_build_object('ok', true);
end $$;

-- Right to erasure: anonymises the account and removes child profiles managed only by this parent.
create or replace function app.delete_my_account() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := app.uid();
begin
  if v_user is null or app.has_role('child') then return app.err('FORBIDDEN'); end if;
  delete from users u where u.id in (select child_id from parent_child_links l where l.parent_id = v_user)
    and not exists (select 1 from parent_child_links o where o.child_id = u.id and o.parent_id <> v_user);
  delete from sessions where user_id = v_user;
  delete from blockchain_links where user_id = v_user;
  update profiles set display_name = 'deleted', birth_year = null, public_collection = false where user_id = v_user;
  update users set email = null, password_hash = null, status = 'deleted', deleted_at = now() where id = v_user;
  perform app.audit('user.delete', 'user', v_user::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function app.delete_child(p_child uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_guardian_of(p_child) then return app.err('NOT_FOUND'); end if;
  if not exists (select 1 from users where id = p_child and roles = '{child}') then return app.err('NOT_FOUND'); end if;
  update toy_instances set assigned_child_id = null where assigned_child_id = p_child;
  delete from users where id = p_child;
  perform app.audit('child.delete', 'user', p_child::text);
  return jsonb_build_object('ok', true);
end $$;

-- ───────────── Points ledger ─────────────
-- Internal: the only place balances change. Idempotent by key.
create or replace function app.post_points(p_account uuid, p_amount int, p_kind text, p_ref_type text, p_ref_id uuid, p_key text, p_note text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_balance int; v_existing points_transactions;
begin
  select balance into v_balance from points_accounts where id = p_account for update;
  if not found then return app.err('ACCOUNT_NOT_FOUND'); end if;
  select * into v_existing from points_transactions where idempotency_key = p_key;
  if found then
    return jsonb_build_object('ok', true, 'replayed', true, 'transaction_id', v_existing.id, 'balance', v_balance);
  end if;
  if v_balance + p_amount < 0 then return app.err('INSUFFICIENT_POINTS'); end if;
  update points_accounts set balance = v_balance + p_amount, updated_at = now() where id = p_account;
  insert into points_transactions (account_id, amount, balance_after, kind, reference_type, reference_id, idempotency_key, created_by, note)
  values (p_account, p_amount, v_balance + p_amount, p_kind, p_ref_type, p_ref_id, p_key, app.uid(), p_note)
  returning id into v_existing.id;
  return jsonb_build_object('ok', true, 'replayed', false, 'transaction_id', v_existing.id, 'balance', v_balance + p_amount);
end $$;
revoke execute on function app.post_points(uuid, int, text, text, uuid, text, text) from public, modu_app;
revoke execute on function app.ensure_points_account(uuid) from public, modu_app;

create or replace function app.admin_adjust_points(p_account uuid, p_amount int, p_note text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_res jsonb;
begin
  if not app.is_admin() then return app.err('FORBIDDEN'); end if;
  if p_amount = 0 or abs(p_amount) > 10000 or coalesce(trim(p_note), '') = '' then return app.err('INVALID_INPUT'); end if;
  v_res := app.post_points(p_account, p_amount, case when p_amount > 0 then 'admin_credit' else 'admin_debit' end,
                           'admin', null, 'admin:' || p_key, p_note);
  if (v_res->>'ok')::boolean and not (v_res->>'replayed')::boolean then
    perform app.audit('points.adjust', 'points_account', p_account::text, jsonb_build_object('amount', p_amount, 'note', p_note));
  end if;
  return v_res;
end $$;

-- ───────────── Toys & NFC ─────────────
-- Public digital passport. Never returns owner identity.
create or replace function app.toy_passport(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_tag nfc_tags; v_toy toy_instances; v_char characters; v_batch toy_batches; v_owner_public text;
begin
  update nfc_tags set scan_count = scan_count + 1, last_scanned_at = now() where public_token = p_token returning * into v_tag;
  if not found then return app.err('NOT_FOUND'); end if;
  select * into v_toy from toy_instances where id = v_tag.toy_instance_id;
  select * into v_char from characters where id = v_toy.character_id;
  select * into v_batch from toy_batches where id = v_toy.batch_id;
  if v_toy.owner_user_id is not null then
    select display_name into v_owner_public from profiles where user_id = v_toy.owner_user_id and public_collection;
  end if;
  return jsonb_build_object(
    'ok', true,
    'toy_id', v_toy.id,
    'serial', v_toy.serial_number,
    'edition_number', v_toy.edition_number,
    'batch_quantity', v_batch.quantity,
    'batch_code', v_batch.code,
    'edition', v_batch.edition,
    'is_demo', v_batch.is_demo,
    'status', case when v_tag.status = 'revoked' then 'revoked' else v_toy.status end,
    'activated_at', v_toy.activated_at,
    'tag_type', v_tag.tag_type,
    'locked', coalesce(v_tag.locked_until > now(), false),
    'is_owner', v_toy.owner_user_id is not null and v_toy.owner_user_id = app.uid(),
    'owner_public_name', v_owner_public,
    'transfers', (select count(*) from ownership_transfers where toy_instance_id = v_toy.id and status = 'completed'),
    'character', jsonb_build_object('slug', v_char.slug, 'name', v_char.name, 'rarity', v_char.rarity,
                                    'image_path', v_char.image_path, 'series', v_char.series, 'content', v_char.content)
  );
end $$;

create or replace function app.register_failed_attempt(p_tag uuid) returns void
language sql security definer set search_path = public as $$
  update nfc_tags set failed_attempts = failed_attempts + 1,
    locked_until = case when failed_attempts + 1 >= 5 then now() + interval '30 minutes' else locked_until end
  where id = p_tag;
$$;
revoke execute on function app.register_failed_attempt(uuid) from public, modu_app;

create or replace function app.activate_toy(p_token text, p_secret_hash text, p_child uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_user uuid := app.uid(); v_tag nfc_tags; v_toy toy_instances; v_account uuid;
begin
  if v_user is null then return app.err('UNAUTHENTICATED'); end if;
  if app.has_role('child') then return app.err('FORBIDDEN'); end if;
  if p_child is not null and not app.is_guardian_of(p_child) then return app.err('FORBIDDEN'); end if;
  select * into v_tag from nfc_tags where public_token = p_token for update;
  if not found then return app.err('NOT_FOUND'); end if;
  if v_tag.status <> 'active' then return app.err('REVOKED'); end if;
  if v_tag.locked_until > now() then return app.err('LOCKED'); end if;
  select * into v_toy from toy_instances where id = v_tag.toy_instance_id for update;
  if v_toy.status = 'revoked' then return app.err('REVOKED'); end if;
  if v_toy.status <> 'in_stock' or v_tag.activation_secret_used_at is not null then return app.err('ALREADY_ACTIVATED'); end if;
  if v_tag.activation_secret_hash is null or v_tag.activation_secret_hash <> p_secret_hash then
    perform app.register_failed_attempt(v_tag.id);
    return app.err('INVALID_CODE');
  end if;

  update toy_instances set status = 'activated', owner_user_id = v_user, assigned_child_id = p_child, activated_at = now()
    where id = v_toy.id;
  update nfc_tags set activation_secret_used_at = now(), failed_attempts = 0, locked_until = null where id = v_tag.id;
  insert into activations (toy_instance_id, nfc_tag_id, user_id) values (v_toy.id, v_tag.id, v_user);
  v_account := app.ensure_points_account(coalesce(p_child, v_user));
  perform app.post_points(v_account, 100, 'welcome_bonus', 'toy_instance', v_toy.id, 'welcome:' || v_toy.id, 'Welcome bonus for activating ' || v_toy.serial_number);
  perform app.audit('toy.activate', 'toy_instance', v_toy.id::text, jsonb_build_object('serial', v_toy.serial_number));
  return jsonb_build_object('ok', true, 'toy_id', v_toy.id, 'serial', v_toy.serial_number, 'bonus', 100);
end $$;

create or replace function app.create_transfer(p_toy uuid, p_code_hash text, p_ttl_hours int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_toy toy_instances; v_id uuid;
begin
  select * into v_toy from toy_instances where id = p_toy for update;
  if not found or v_toy.owner_user_id is distinct from app.uid() then return app.err('NOT_FOUND'); end if;
  if v_toy.status <> 'activated' then return app.err('INVALID_STATE'); end if;
  insert into ownership_transfers (toy_instance_id, from_user_id, code_hash, expires_at)
  values (p_toy, app.uid(), p_code_hash, now() + make_interval(hours => least(greatest(p_ttl_hours, 1), 168))) returning id into v_id;
  update toy_instances set status = 'transfer_pending' where id = p_toy;
  perform app.audit('toy.transfer_create', 'toy_instance', p_toy::text);
  return jsonb_build_object('ok', true, 'transfer_id', v_id);
end $$;

create or replace function app.cancel_transfer(p_toy uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_toy toy_instances;
begin
  select * into v_toy from toy_instances where id = p_toy for update;
  if not found or (v_toy.owner_user_id is distinct from app.uid() and not app.is_admin()) then return app.err('NOT_FOUND'); end if;
  update ownership_transfers set status = 'cancelled' where toy_instance_id = p_toy and status = 'pending';
  if v_toy.status = 'transfer_pending' then update toy_instances set status = 'activated' where id = p_toy; end if;
  perform app.audit('toy.transfer_cancel', 'toy_instance', p_toy::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function app.accept_transfer(p_token text, p_code_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_user uuid := app.uid(); v_tag nfc_tags; v_toy toy_instances; v_tr ownership_transfers;
begin
  if v_user is null then return app.err('UNAUTHENTICATED'); end if;
  if app.has_role('child') then return app.err('FORBIDDEN'); end if;
  select * into v_tag from nfc_tags where public_token = p_token for update;
  if not found then return app.err('NOT_FOUND'); end if;
  if v_tag.locked_until > now() then return app.err('LOCKED'); end if;
  select * into v_toy from toy_instances where id = v_tag.toy_instance_id for update;
  select * into v_tr from ownership_transfers where toy_instance_id = v_toy.id and status = 'pending' for update;
  if not found or v_toy.status <> 'transfer_pending' then return app.err('NO_PENDING_TRANSFER'); end if;
  if v_tr.expires_at < now() then
    update ownership_transfers set status = 'expired' where id = v_tr.id;
    update toy_instances set status = 'activated' where id = v_toy.id;
    return app.err('EXPIRED');
  end if;
  if v_tr.code_hash <> p_code_hash then
    perform app.register_failed_attempt(v_tag.id);
    return app.err('INVALID_CODE');
  end if;
  if v_tr.from_user_id = v_user then return app.err('SELF_TRANSFER'); end if;
  update ownership_transfers set status = 'completed', to_user_id = v_user, completed_at = now() where id = v_tr.id;
  update toy_instances set owner_user_id = v_user, assigned_child_id = null, status = 'activated' where id = v_toy.id;
  update nfc_tags set failed_attempts = 0 where id = v_tag.id;
  update digital_collectibles set owner_user_id = v_user where toy_instance_id = v_toy.id;
  perform app.ensure_points_account(v_user);
  perform app.audit('toy.transfer_accept', 'toy_instance', v_toy.id::text, jsonb_build_object('transfer_id', v_tr.id));
  return jsonb_build_object('ok', true, 'toy_id', v_toy.id, 'serial', v_toy.serial_number);
end $$;

-- Admin: create a batch with pre-generated random tokens and HMACs of activation codes.
create or replace function app.create_batch(p_character uuid, p_code text, p_edition text, p_tag_type text,
                                            p_tokens text[], p_secret_hashes text[], p_is_demo boolean, p_notes text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_batch uuid; v_prefix text; v_toy uuid; v_n int := coalesce(array_length(p_tokens, 1), 0); i int;
begin
  if not app.is_admin() then return app.err('FORBIDDEN'); end if;
  if v_n < 1 or v_n > 1000 or v_n <> coalesce(array_length(p_secret_hashes, 1), 0) then return app.err('INVALID_INPUT'); end if;
  select serial_prefix into v_prefix from characters where id = p_character;
  if not found then return app.err('NOT_FOUND'); end if;
  if exists (select 1 from toy_batches where code = p_code) then return app.err('BATCH_CODE_TAKEN'); end if;
  insert into toy_batches (code, character_id, quantity, edition, notes, is_demo, created_by)
  values (p_code, p_character, v_n, p_edition, p_notes, p_is_demo, app.uid()) returning id into v_batch;
  for i in 1..v_n loop
    insert into toy_instances (batch_id, character_id, serial_number, edition_number)
    values (v_batch, p_character, v_prefix || '-' || p_code || '-' || lpad(i::text, 4, '0'), i) returning id into v_toy;
    insert into nfc_tags (toy_instance_id, public_token, tag_type, activation_secret_hash, activation_secret_issued_at)
    values (v_toy, p_tokens[i], p_tag_type, p_secret_hashes[i], now());
  end loop;
  perform app.audit('batch.create', 'toy_batch', v_batch::text, jsonb_build_object('code', p_code, 'quantity', v_n));
  return jsonb_build_object('ok', true, 'batch_id', v_batch);
end $$;

create or replace function app.reissue_activation_code(p_toy uuid, p_secret_hash text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.is_admin() then return app.err('FORBIDDEN'); end if;
  if not exists (select 1 from toy_instances where id = p_toy and status = 'in_stock' for update) then return app.err('INVALID_STATE'); end if;
  update nfc_tags set activation_secret_hash = p_secret_hash, activation_secret_issued_at = now(),
    failed_attempts = 0, locked_until = null where toy_instance_id = p_toy;
  perform app.audit('toy.reissue_code', 'toy_instance', p_toy::text);
  return jsonb_build_object('ok', true);
end $$;

create or replace function app.set_toy_revoked(p_toy uuid, p_revoked boolean, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_toy toy_instances;
begin
  if not app.is_admin() then return app.err('FORBIDDEN'); end if;
  select * into v_toy from toy_instances where id = p_toy for update;
  if not found then return app.err('NOT_FOUND'); end if;
  update nfc_tags set status = case when p_revoked then 'revoked' else 'active' end where toy_instance_id = p_toy;
  if p_revoked then
    update ownership_transfers set status = 'cancelled' where toy_instance_id = p_toy and status = 'pending';
    update toy_instances set status = 'revoked' where id = p_toy;
  else
    update toy_instances set status = case when owner_user_id is null then 'in_stock' else 'activated' end where id = p_toy;
  end if;
  perform app.audit(case when p_revoked then 'toy.revoke' else 'toy.restore' end, 'toy_instance', p_toy::text, jsonb_build_object('reason', p_reason));
  return jsonb_build_object('ok', true);
end $$;

-- ───────────── MODU School ─────────────
-- Rewards effort and improvement more than high grades alone.
create or replace function app.suggest_achievement_points(p_kind text, p_prev numeric, p_cur numeric) returns int
language sql immutable as $$
  select case p_kind
    when 'task' then 50
    when 'olympiad' then 150
    when 'grade' then case when p_cur >= 9 then 60 when p_cur >= 7 then 40 else 25 end
    when 'improvement' then case
      when p_prev is null or p_cur is null or p_cur <= p_prev then 15
      else least(300, 40 + round((p_cur - p_prev) * 60)::int) end
    else 0 end
$$;

create or replace function app.submit_achievement(p_child uuid, p_kind text, p_subject text, p_period text,
  p_prev numeric, p_cur numeric, p_description text, p_evidence_path text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_fp text; v_id uuid;
begin
  if not app.is_guardian_of(p_child) then return app.err('FORBIDDEN'); end if;
  if (select count(*) from school_achievements where child_id = p_child and status = 'pending') >= 10 then
    return app.err('TOO_MANY_PENDING');
  end if;
  v_fp := encode(digest(concat_ws('|', p_child, p_kind, lower(trim(p_subject)), lower(trim(p_period)),
                                   coalesce(p_prev::text, '-'), coalesce(p_cur::text, '-')), 'sha256'), 'hex');
  if exists (select 1 from school_achievements where child_id = p_child and fingerprint = v_fp) then
    return app.err('DUPLICATE');
  end if;
  insert into school_achievements (child_id, submitted_by, kind, subject, period, previous_value, current_value,
                                   description, evidence_path, fingerprint)
  values (p_child, app.uid(), p_kind, trim(p_subject), trim(p_period), p_prev, p_cur, p_description, p_evidence_path, v_fp)
  returning id into v_id;
  perform app.audit('achievement.submit', 'school_achievement', v_id::text);
  return jsonb_build_object('ok', true, 'achievement_id', v_id,
    'suggested_points', app.suggest_achievement_points(p_kind, p_prev, p_cur));
exception when unique_violation then
  return app.err('DUPLICATE');
end $$;

create or replace function app.review_achievement(p_id uuid, p_decision text, p_points int, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_a school_achievements; v_points int := 0; v_account uuid;
begin
  if not app.is_admin() then return app.err('FORBIDDEN'); end if;
  if p_decision not in ('approved', 'rejected') then return app.err('INVALID_INPUT'); end if;
  select * into v_a from school_achievements where id = p_id for update;
  if not found then return app.err('NOT_FOUND'); end if;
  if v_a.status <> 'pending' then return app.err('ALREADY_REVIEWED'); end if;
  if p_decision = 'approved' then
    v_points := least(500, greatest(0, coalesce(p_points, app.suggest_achievement_points(v_a.kind, v_a.previous_value, v_a.current_value))));
  end if;
  insert into achievement_reviews (achievement_id, reviewer_id, decision, points, comment)
  values (p_id, app.uid(), p_decision, v_points, p_comment);
  -- data minimisation: the evidence file is removed right after the review
  update school_achievements set status = p_decision, points_awarded = v_points, reviewed_at = now(),
    evidence_path = null, evidence_deleted_at = case when evidence_path is not null then now() end
  where id = p_id;
  if v_points > 0 then
    v_account := app.ensure_points_account(v_a.child_id);
    perform app.post_points(v_account, v_points, 'achievement', 'school_achievement', p_id, 'achievement:' || p_id,
                            v_a.kind || ': ' || v_a.subject || ' (' || v_a.period || ')');
  end if;
  perform app.audit('achievement.review', 'school_achievement', p_id::text, jsonb_build_object('decision', p_decision, 'points', v_points));
  return jsonb_build_object('ok', true, 'points', v_points, 'evidence_path', v_a.evidence_path);
end $$;

-- ───────────── Rewards ─────────────
create or replace function app.redeem_reward(p_account uuid, p_reward uuid, p_key text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_acc points_accounts; v_reward reward_catalog; v_red reward_redemptions; v_coupon coupons; v_res jsonb; v_code text;
begin
  if app.uid() is null then return app.err('UNAUTHENTICATED'); end if;
  if p_key is null or length(p_key) < 16 then return app.err('INVALID_INPUT'); end if;
  -- lock the account first: serialises every spend from this account
  select * into v_acc from points_accounts where id = p_account for update;
  if not found or not app.can_act_for(v_acc.user_id) then return app.err('NOT_FOUND'); end if;
  -- idempotent replay (double click, network retry)
  select * into v_red from reward_redemptions where idempotency_key = p_key;
  if found then
    if v_red.account_id <> p_account then return app.err('INVALID_INPUT'); end if;
    select * into v_coupon from coupons where redemption_id = v_red.id;
    return jsonb_build_object('ok', true, 'replayed', true, 'redemption_id', v_red.id, 'coupon_code', v_coupon.code,
                              'balance', v_acc.balance);
  end if;
  select * into v_reward from reward_catalog where id = p_reward for update;
  if not found or not v_reward.is_active then return app.err('REWARD_UNAVAILABLE'); end if;
  if v_reward.partner_id is not null and exists (select 1 from partners where id = v_reward.partner_id and status <> 'active') then
    return app.err('REWARD_UNAVAILABLE');
  end if;
  if (v_reward.valid_from is not null and v_reward.valid_from > now()) or (v_reward.valid_until is not null and v_reward.valid_until < now()) then
    return app.err('REWARD_EXPIRED');
  end if;
  if v_reward.stock is not null and v_reward.stock < 1 then return app.err('OUT_OF_STOCK'); end if;
  if v_reward.per_user_limit is not null and (select count(*) from reward_redemptions
      where account_id = p_account and reward_id = p_reward and status <> 'cancelled') >= v_reward.per_user_limit then
    return app.err('LIMIT_REACHED');
  end if;
  if v_acc.balance < v_reward.cost_points then return app.err('INSUFFICIENT_POINTS'); end if;

  insert into reward_redemptions (reward_id, account_id, requested_by, points_spent, idempotency_key)
  values (p_reward, p_account, app.uid(), v_reward.cost_points, p_key) returning * into v_red;
  v_res := app.post_points(p_account, -v_reward.cost_points, 'redemption', 'reward_redemption', v_red.id, 'redeem:' || v_red.id,
                           v_reward.title->>'en');
  if not (v_res->>'ok')::boolean then raise exception 'ledger failure: %', v_res->>'error'; end if;
  if v_reward.stock is not null then update reward_catalog set stock = stock - 1 where id = p_reward; end if;
  v_code := 'MODU-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4)) || '-' || upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 4));
  insert into coupons (redemption_id, reward_id, partner_id, code, expires_at)
  values (v_red.id, p_reward, v_reward.partner_id, v_code, now() + make_interval(days => v_reward.coupon_ttl_days)) returning * into v_coupon;
  perform app.audit('reward.redeem', 'reward_redemption', v_red.id::text, jsonb_build_object('reward', v_reward.slug, 'points', v_reward.cost_points));
  return jsonb_build_object('ok', true, 'replayed', false, 'redemption_id', v_red.id, 'coupon_code', v_coupon.code,
                            'balance', (v_res->>'balance')::int);
end $$;

-- Partner (or admin) marks a coupon as used at the point of sale. Single use.
create or replace function app.redeem_coupon(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_c coupons; v_title jsonb;
begin
  select * into v_c from coupons where code = upper(trim(p_code)) for update;
  if not found then return app.err('NOT_FOUND'); end if;
  -- MODU's own rewards (no partner) are redeemed by admins; partner rewards by that partner's staff
  if not (app.is_admin() or coalesce(v_c.partner_id = app.my_partner_id(), false)) then
    return app.err('NOT_FOUND');
  end if;
  if v_c.status = 'redeemed' then return app.err('ALREADY_REDEEMED'); end if;
  if v_c.status = 'void' then return app.err('VOID'); end if;
  if v_c.expires_at < now() then
    update coupons set status = 'void' where id = v_c.id;
    update reward_redemptions set status = 'expired' where id = v_c.redemption_id;
    return app.err('EXPIRED');
  end if;
  update coupons set status = 'redeemed', redeemed_at = now(), redeemed_by = app.uid() where id = v_c.id;
  update reward_redemptions set status = 'redeemed' where id = v_c.redemption_id;
  select title into v_title from reward_catalog where id = v_c.reward_id;
  perform app.audit('coupon.redeem', 'coupon', v_c.id::text, jsonb_build_object('code', v_c.code));
  return jsonb_build_object('ok', true, 'reward_title', v_title);
end $$;

-- Admin cancels an unused coupon and refunds the points.
create or replace function app.cancel_redemption(p_redemption uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_red reward_redemptions; v_res jsonb;
begin
  if not app.is_admin() then return app.err('FORBIDDEN'); end if;
  select * into v_red from reward_redemptions where id = p_redemption for update;
  if not found then return app.err('NOT_FOUND'); end if;
  if v_red.status <> 'issued' then return app.err('INVALID_STATE'); end if;
  update reward_redemptions set status = 'cancelled' where id = p_redemption;
  update coupons set status = 'void' where redemption_id = p_redemption;
  update reward_catalog set stock = stock + 1 where id = v_red.reward_id and stock is not null;
  v_res := app.post_points(v_red.account_id, v_red.points_spent, 'refund', 'reward_redemption', p_redemption, 'refund:' || p_redemption, p_reason);
  perform app.audit('reward.cancel', 'reward_redemption', p_redemption::text, jsonb_build_object('reason', p_reason));
  return v_res;
end $$;

-- ───────────── Web3 (adults, testnet) ─────────────
create or replace function app.wallet_nonce_create(p_nonce text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not app.has_role('collector') then return app.err('FORBIDDEN'); end if;
  delete from wallet_nonces where user_id = app.uid() and (used_at is not null or expires_at < now());
  insert into wallet_nonces (nonce, user_id, expires_at) values (p_nonce, app.uid(), now() + interval '10 minutes');
  return jsonb_build_object('ok', true);
end $$;

-- Called only after the server has verified the signature over the nonce message.
create or replace function app.wallet_link(p_nonce text, p_address text, p_chain_id int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n wallet_nonces;
begin
  if not app.has_role('collector') then return app.err('FORBIDDEN'); end if;
  select * into v_n from wallet_nonces where nonce = p_nonce for update;
  if not found or v_n.user_id <> app.uid() or v_n.used_at is not null or v_n.expires_at < now() then
    return app.err('INVALID_NONCE');
  end if;
  update wallet_nonces set used_at = now() where nonce = p_nonce;
  if exists (select 1 from blockchain_links where address = lower(p_address) and chain_id = p_chain_id and user_id <> app.uid()) then
    return app.err('WALLET_TAKEN');
  end if;
  insert into blockchain_links (user_id, address, chain_id, verified_at) values (app.uid(), lower(p_address), p_chain_id, now())
  on conflict (address, chain_id) do update set verified_at = now();
  perform app.audit('wallet.link', 'blockchain_link', lower(p_address), jsonb_build_object('chain_id', p_chain_id));
  return jsonb_build_object('ok', true);
end $$;

create sequence if not exists certificate_token_seq start 1;
grant usage, select on sequence certificate_token_seq to modu_app;

-- Collector requests a testnet certificate for a toy they own. Metadata is public and contains no personal data.
create or replace function app.request_certificate(p_toy uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_toy toy_instances; v_char characters; v_id uuid; v_token bigint;
begin
  if not app.has_role('collector') then return app.err('FORBIDDEN'); end if;
  select * into v_toy from toy_instances where id = p_toy for update;
  if not found or v_toy.owner_user_id is distinct from app.uid() or v_toy.status not in ('activated') then return app.err('NOT_FOUND'); end if;
  select id into v_id from digital_collectibles where toy_instance_id = p_toy and kind = 'certificate';
  if found then
    update digital_collectibles set owner_user_id = app.uid() where id = v_id;
    return jsonb_build_object('ok', true, 'collectible_id', v_id, 'existing', true);
  end if;
  select * into v_char from characters where id = v_toy.character_id;
  v_token := nextval('certificate_token_seq');
  insert into digital_collectibles (toy_instance_id, owner_user_id, kind, token_id, metadata)
  values (p_toy, app.uid(), 'certificate', v_token, jsonb_build_object(
    'name', v_char.name || ' #' || v_toy.edition_number,
    'serial', v_toy.serial_number,
    'character', v_char.slug,
    'rarity', v_char.rarity,
    'series', v_char.series,
    'image', v_char.image_path))
  returning id into v_id;
  perform app.audit('certificate.request', 'digital_collectible', v_id::text);
  return jsonb_build_object('ok', true, 'collectible_id', v_id, 'existing', false);
end $$;

create or replace function app.mark_certificate_minted(p_id uuid, p_chain int, p_contract text, p_tx text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not (app.is_admin() or exists (select 1 from digital_collectibles where id = p_id and owner_user_id = app.uid())) then
    return app.err('FORBIDDEN');
  end if;
  update digital_collectibles set status = 'minted', chain_id = p_chain, contract_address = lower(p_contract), tx_hash = p_tx where id = p_id;
  perform app.audit('certificate.minted', 'digital_collectible', p_id::text, jsonb_build_object('tx', p_tx));
  return jsonb_build_object('ok', true);
end $$;

grant execute on all functions in schema app to modu_app;
revoke execute on function app.post_points(uuid, int, text, text, uuid, text, text) from modu_app;
revoke execute on function app.ensure_points_account(uuid) from modu_app;
revoke execute on function app.register_failed_attempt(uuid) from modu_app;

-- Public ERC-721 metadata for a certificate token id (no personal data).
create or replace function app.certificate_metadata(p_token_id numeric) returns jsonb
language sql stable security definer set search_path = public as $fn$
  select jsonb_build_object(
    'name', 'MODU Certificate — ' || (d.metadata->>'name'),
    'description', 'Testnet digital certificate of a physical MODU WORLD collectible. Not an investment product.',
    'image', d.metadata->>'image',
    'attributes', jsonb_build_array(
      jsonb_build_object('trait_type', 'Serial', 'value', d.metadata->>'serial'),
      jsonb_build_object('trait_type', 'Character', 'value', d.metadata->>'character'),
      jsonb_build_object('trait_type', 'Rarity', 'value', d.metadata->>'rarity'),
      jsonb_build_object('trait_type', 'Series', 'value', d.metadata->>'series')))
  from digital_collectibles d where d.token_id = p_token_id and d.kind = 'certificate'
$fn$;
grant execute on function app.certificate_metadata(numeric) to modu_app;

-- Public list of DEMO tags (is_demo batches only) for presentations without a physical toy.
create or replace function app.demo_tags() returns table (serial text, public_token text, status text, character_name text)
language sql stable security definer set search_path = public as $fn$
  select t.serial_number, n.public_token, t.status, c.name
    from toy_instances t join toy_batches b on b.id = t.batch_id join nfc_tags n on n.toy_instance_id = t.id
    join characters c on c.id = t.character_id
   where b.is_demo order by b.created_at desc, t.edition_number limit 12
$fn$;
grant execute on function app.demo_tags() to modu_app;
