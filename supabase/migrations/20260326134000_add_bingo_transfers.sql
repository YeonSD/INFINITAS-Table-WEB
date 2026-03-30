alter table public.account_states
  add column if not exists bingo_state jsonb not null default '{}'::jsonb;

create table if not exists public.bingo_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  bingo jsonb not null default '{}'::jsonb,
  sender_dj_name text,
  sender_infinitas_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint bingo_transfers_not_self_chk check (sender_user_id <> receiver_user_id),
  constraint bingo_transfers_status_chk check (status in ('pending', 'accepted', 'rejected', 'canceled'))
);

create unique index if not exists bingo_transfers_pending_unique
  on public.bingo_transfers (sender_user_id, receiver_user_id)
  where status = 'pending';

alter table public.bingo_transfers enable row level security;

drop policy if exists bingo_transfers_select_participants on public.bingo_transfers;
create policy bingo_transfers_select_participants on public.bingo_transfers
  for select using (auth.uid() in (sender_user_id, receiver_user_id));

drop policy if exists bingo_transfers_insert_sender on public.bingo_transfers;
create policy bingo_transfers_insert_sender on public.bingo_transfers
  for insert with check (auth.uid() = sender_user_id);

drop policy if exists bingo_transfers_update_receiver_sender on public.bingo_transfers;
create policy bingo_transfers_update_receiver_sender on public.bingo_transfers
  for update using (auth.uid() in (sender_user_id, receiver_user_id))
  with check (auth.uid() in (sender_user_id, receiver_user_id));

create or replace function public.purge_my_social_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.goal_transfers
  where sender_user_id = auth.uid()
     or receiver_user_id = auth.uid();

  delete from public.bingo_transfers
  where sender_user_id = auth.uid()
     or receiver_user_id = auth.uid();

  delete from public.social_feed_events
  where owner_user_id = auth.uid()
     or actor_user_id = auth.uid();

  delete from public.follow_requests
  where requester_user_id = auth.uid()
     or target_user_id = auth.uid();

  delete from public.follows
  where follower_user_id = auth.uid()
     or following_user_id = auth.uid();

  delete from public.goal_shares
  where owner_user_id = auth.uid()
     or target_user_id = auth.uid();

  delete from public.account_states where auth_user_id = auth.uid();
  delete from public.users where auth_user_id = auth.uid();
end;
$$;

revoke all on function public.purge_my_social_data() from public;
grant execute on function public.purge_my_social_data() to authenticated;

create or replace function public.guard_account_states_update_reason()
returns trigger
language plpgsql
as $$
declare
  v_reason text := coalesce(new.update_reason, '');
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_reason = '' then
    raise exception 'account_states.update_reason is required';
  end if;

  if v_reason <> all (array[
    'profile-save',
    'tsv-upload',
    'history-rollback',
    'goal-import',
    'bingo-draft-save',
    'bingo-publish',
    'bingo-import',
    'bingo-delete',
    'settings-save',
    'social-banner',
    'goal-clear',
    'goal-clear-achieved',
    'goal-delete',
    'goal-save',
    'goal-transfer-accepted',
    'bingo-transfer-accepted'
  ]) then
    raise exception 'account_states.update_reason "%" is not allowed', v_reason;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_account_states_update_reason on public.account_states;
create trigger trg_guard_account_states_update_reason
before insert or update on public.account_states
for each row execute procedure public.guard_account_states_update_reason();

create or replace function public.send_bingo_to_user(
  p_target_user_id uuid,
  p_bingo jsonb,
  p_sender_dj_name text default '',
  p_sender_infinitas_id text default ''
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share_scope jsonb;
  v_sender_goal_transfer_enabled boolean := true;
  v_target_goal_transfer_enabled boolean := true;
  v_size int := 3;
  v_count int := 0;
  v_norm_cells jsonb := '[]'::jsonb;
  v_norm_bingo jsonb := '{}'::jsonb;
  v_transfer_id uuid;
  v_sender_label text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_user_id is null then
    raise exception 'invalid_target';
  end if;
  if auth.uid() = p_target_user_id then
    raise exception 'cannot_send_to_self';
  end if;
  if not exists (
    select 1 from public.follows f
    where f.follower_user_id = auth.uid()
      and f.following_user_id = p_target_user_id
  ) or not exists (
    select 1 from public.follows f
    where f.follower_user_id = p_target_user_id
      and f.following_user_id = auth.uid()
  ) then
    raise exception 'mutual_follow_required';
  end if;

  select coalesce((a.social_settings->>'goalTransferEnabled')::boolean, true)
  into v_sender_goal_transfer_enabled
  from public.account_states a
  where a.auth_user_id = auth.uid();

  if coalesce(v_sender_goal_transfer_enabled, true) is not true then
    raise exception 'sender_goal_transfer_disabled';
  end if;

  select coalesce(a.social_settings->'shareDataScope', '[]'::jsonb)
  into v_share_scope
  from public.account_states a
  where a.auth_user_id = p_target_user_id;

  if not (
    coalesce(v_share_scope, '[]'::jsonb) ? 'all'
    or coalesce(v_share_scope, '[]'::jsonb) ? 'goals'
  ) then
    raise exception 'target_goal_share_disabled';
  end if;

  select coalesce((a.social_settings->>'goalTransferEnabled')::boolean, true)
  into v_target_goal_transfer_enabled
  from public.account_states a
  where a.auth_user_id = p_target_user_id;

  if coalesce(v_target_goal_transfer_enabled, true) is not true then
    raise exception 'target_goal_transfer_disabled';
  end if;

  v_size := greatest(3, least(coalesce((p_bingo->>'size')::int, 3), 5));

  select coalesce(jsonb_agg(c), '[]'::jsonb), count(*)
  into v_norm_cells, v_count
  from jsonb_array_elements(coalesce(p_bingo->'cells', '[]'::jsonb)) c
  where coalesce(c->>'title', '') <> '';

  if v_count <> v_size * v_size then
    raise exception 'invalid_bingo_payload';
  end if;

  v_norm_bingo := jsonb_build_object(
    'name', coalesce(nullif(trim(p_bingo->>'name'), ''), 'Shared Bingo'),
    'size', v_size,
    'cells', v_norm_cells
  );
  v_sender_label := coalesce(nullif(trim(p_sender_dj_name), ''), 'Bingo Share');
  if nullif(trim(p_sender_infinitas_id), '') is not null then
    v_sender_label := v_sender_label || ' (' || trim(p_sender_infinitas_id) || ')';
  end if;

  insert into public.bingo_transfers (
    sender_user_id,
    receiver_user_id,
    bingo,
    sender_dj_name,
    sender_infinitas_id,
    status
  ) values (
    auth.uid(),
    p_target_user_id,
    v_norm_bingo,
    nullif(trim(p_sender_dj_name), ''),
    nullif(trim(p_sender_infinitas_id), ''),
    'pending'
  )
  on conflict (sender_user_id, receiver_user_id) where (status = 'pending')
  do update set
    bingo = excluded.bingo,
    sender_dj_name = excluded.sender_dj_name,
    sender_infinitas_id = excluded.sender_infinitas_id,
    created_at = now(),
    responded_at = null,
    status = 'pending'
  returning id into v_transfer_id;

  perform public.create_social_feed_event(
    p_target_user_id,
    auth.uid(),
    'bingo_transfer_received',
    jsonb_build_object(
      'transfer_id', v_transfer_id::text,
      'bingo_name', v_norm_bingo->>'name',
      'size', v_size,
      'sender_label', v_sender_label,
      'bingo', v_norm_bingo
    ),
    'bingo_transfers',
    v_transfer_id
  );

  return v_count;
end;
$$;

revoke all on function public.send_bingo_to_user(uuid, jsonb, text, text) from public;
grant execute on function public.send_bingo_to_user(uuid, jsonb, text, text) to authenticated;

create or replace function public.respond_bingo_transfer(
  p_transfer_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.bingo_transfers;
  v_name text;
  v_size int;
  v_cells jsonb;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_transfer
  from public.bingo_transfers
  where id = p_transfer_id
    and receiver_user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'bingo_transfer_not_found';
  end if;

  if not p_accept then
    update public.bingo_transfers
      set status = 'rejected', responded_at = now()
    where id = p_transfer_id;
    return 'rejected';
  end if;

  v_name := coalesce(nullif(trim(v_transfer.bingo->>'name'), ''), 'Shared Bingo');
  v_size := greatest(3, least(coalesce((v_transfer.bingo->>'size')::int, 3), 5));
  v_cells := coalesce(v_transfer.bingo->'cells', '[]'::jsonb);

  insert into public.account_states (auth_user_id, account_id, bingo_state, social_settings, updated_at, update_reason)
  values (
    auth.uid(),
    gen_random_uuid()::text,
    jsonb_build_object(
      'draft', jsonb_build_object(
        'size', v_size,
        'cells', v_cells,
        'updatedAt', now()
      ),
      'published', jsonb_build_object(
        'name', v_name,
        'size', v_size,
        'cells', v_cells,
        'savedAt', now(),
        'sharedFromUserId', v_transfer.sender_user_id::text,
        'sharedFromDjName', coalesce(v_transfer.sender_dj_name, ''),
        'sharedFromInfinitasId', coalesce(v_transfer.sender_infinitas_id, ''),
        'completionNotifiedAt', ''
      ),
      'selectedGoalId', '',
      'selectedCellIndex', -1
    ),
    '{}'::jsonb,
    now(),
    'bingo-transfer-accepted'
  )
  on conflict (auth_user_id)
  do update set
    bingo_state = excluded.bingo_state,
    updated_at = now(),
    update_reason = 'bingo-transfer-accepted';

  update public.bingo_transfers
    set status = 'accepted', responded_at = now()
  where id = p_transfer_id;

  perform public.create_social_feed_event(
    v_transfer.sender_user_id,
    auth.uid(),
    'bingo_transfer_accepted',
    jsonb_build_object(
      'transfer_id', v_transfer.id::text,
      'bingo_name', v_name
    ),
    'bingo_transfers',
    v_transfer.id
  );

  return 'accepted';
end;
$$;

revoke all on function public.respond_bingo_transfer(uuid, boolean) from public;
grant execute on function public.respond_bingo_transfer(uuid, boolean) to authenticated;

create or replace function public.notify_bingo_completion(
  p_sender_user_id uuid,
  p_bingo_name text default ''
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_sender_user_id is null or p_sender_user_id = auth.uid() then
    return false;
  end if;

  perform public.create_social_feed_event(
    p_sender_user_id,
    auth.uid(),
    'bingo_completed',
    jsonb_build_object(
      'bingo_name', coalesce(nullif(trim(p_bingo_name), ''), 'bingo')
    ),
    'account_states',
    null
  );

  return true;
end;
$$;

revoke all on function public.notify_bingo_completion(uuid, text) from public;
grant execute on function public.notify_bingo_completion(uuid, text) to authenticated;
