-- INFINITAS Table Maker (Supabase)
-- Apply in Supabase SQL Editor

create extension if not exists pgcrypto;

create table if not exists public.users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  infinitas_id text not null unique,
  dj_name text not null,
  google_email text,
  icon_data_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_infinitas_id_format_chk check (
    infinitas_id ~ '^C-[0-9]{4}-[0-9]{4}-[0-9]{4}$'
    and infinitas_id <> 'C-0000-0000-0000'
  )
);

create table if not exists public.account_states (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  account_id text not null,
  tracker_rows jsonb not null default '[]'::jsonb,
  goals jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  last_progress jsonb not null default '{}'::jsonb,
  bingo_state jsonb not null default '{}'::jsonb,
  social_settings jsonb not null default '{}'::jsonb,
  update_reason text,
  updated_at timestamptz not null default now()
);

alter table public.account_states
  add column if not exists social_settings jsonb not null default '{}'::jsonb;

alter table public.account_states
  add column if not exists bingo_state jsonb not null default '{}'::jsonb;

create table if not exists public.goal_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  goals jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  message text,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint follow_requests_not_self_chk check (requester_user_id <> target_user_id),
  constraint follow_requests_status_chk check (status in ('pending', 'accepted', 'rejected', 'canceled'))
);

create table if not exists public.follows (
  follower_user_id uuid not null references auth.users(id) on delete cascade,
  following_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_user_id, following_user_id),
  constraint follows_not_self_chk check (follower_user_id <> following_user_id)
);

create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'song',
  song_title text,
  chart_type text,
  challenge_type text not null,
  status text not null default 'pending',
  parent_challenge_id uuid references public.challenges(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint challenges_not_self_chk check (sender_user_id <> receiver_user_id),
  constraint challenges_type_chk check (challenge_type in ('lamp', 'score', 'both')),
  constraint challenges_status_chk check (status in ('pending', 'accepted', 'rejected', 'completed', 'returned')),
  constraint challenges_source_chk check (source in ('song', 'history'))
);

alter table public.users enable row level security;
alter table public.account_states enable row level security;
alter table public.goal_shares enable row level security;
alter table public.follow_requests enable row level security;
alter table public.follows enable row level security;
alter table public.challenges enable row level security;

drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users
  for select using (auth.uid() = auth_user_id);
drop policy if exists users_insert_own on public.users;
create policy users_insert_own on public.users
  for insert with check (auth.uid() = auth_user_id);
drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users
  for update using (auth.uid() = auth_user_id);

drop policy if exists states_select_own on public.account_states;
create policy states_select_own on public.account_states
  for select using (auth.uid() = auth_user_id);
drop policy if exists states_insert_own on public.account_states;
create policy states_insert_own on public.account_states
  for insert with check (auth.uid() = auth_user_id);
drop policy if exists states_update_own on public.account_states;
create policy states_update_own on public.account_states
  for update using (auth.uid() = auth_user_id);

drop policy if exists goal_shares_owner_all on public.goal_shares;
create policy goal_shares_owner_all on public.goal_shares
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists follow_requests_select_participants on public.follow_requests;
create policy follow_requests_select_participants on public.follow_requests
  for select using (auth.uid() in (requester_user_id, target_user_id));
drop policy if exists follow_requests_insert_requester on public.follow_requests;
create policy follow_requests_insert_requester on public.follow_requests
  for insert with check (auth.uid() = requester_user_id);
drop policy if exists follow_requests_update_participants on public.follow_requests;
create policy follow_requests_update_participants on public.follow_requests
  for update using (auth.uid() in (requester_user_id, target_user_id))
  with check (auth.uid() in (requester_user_id, target_user_id));
create unique index if not exists follow_requests_pending_unique
  on public.follow_requests (requester_user_id, target_user_id)
  where status = 'pending';

drop policy if exists follows_select_participants on public.follows;
create policy follows_select_participants on public.follows
  for select using (auth.uid() in (follower_user_id, following_user_id));
drop policy if exists follows_insert_follower on public.follows;
create policy follows_insert_follower on public.follows
  for insert with check (auth.uid() = follower_user_id);
drop policy if exists follows_delete_follower on public.follows;
create policy follows_delete_follower on public.follows
  for delete using (auth.uid() = follower_user_id);

drop policy if exists challenges_select_participants on public.challenges;
create policy challenges_select_participants on public.challenges
  for select using (auth.uid() in (sender_user_id, receiver_user_id));
drop policy if exists challenges_insert_sender on public.challenges;
create policy challenges_insert_sender on public.challenges
  for insert with check (auth.uid() = sender_user_id);
drop policy if exists challenges_update_receiver on public.challenges;
create policy challenges_update_receiver on public.challenges
  for update using (auth.uid() = receiver_user_id) with check (auth.uid() = receiver_user_id);

create or replace function public.get_public_profile_by_infinitas_id(p_infinitas_id text)
returns table (
  auth_user_id uuid,
  infinitas_id text,
  dj_name text,
  discoverability text,
  follow_policy text,
  rival_policy text,
  share_data_scope jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    u.auth_user_id,
    u.infinitas_id,
    u.dj_name,
    coalesce(a.social_settings->>'discoverability', 'searchable') as discoverability,
    coalesce(a.social_settings->>'followPolicy', 'manual') as follow_policy,
    coalesce(a.social_settings->>'rivalPolicy', 'followers') as rival_policy,
    coalesce(a.social_settings->'shareDataScope', '["graphs","goals"]'::jsonb) as share_data_scope
  from public.users u
  left join public.account_states a on a.auth_user_id = u.auth_user_id
  where u.infinitas_id = p_infinitas_id
    and coalesce(a.social_settings->>'discoverability', 'searchable') = 'searchable';
$$;

revoke all on function public.get_public_profile_by_infinitas_id(text) from public;
grant execute on function public.get_public_profile_by_infinitas_id(text) to authenticated;

create or replace function public.get_public_profile_by_dj_name(p_dj_name text)
returns table (
  auth_user_id uuid,
  infinitas_id text,
  dj_name text,
  icon_data_url text,
  share_data_scope jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    u.auth_user_id,
    u.infinitas_id,
    u.dj_name,
    u.icon_data_url,
    coalesce(a.social_settings->'shareDataScope', '["graphs","goals"]'::jsonb) as share_data_scope
  from public.users u
  left join public.account_states a on a.auth_user_id = u.auth_user_id
  where lower(trim(coalesce(u.dj_name, ''))) = lower(trim(coalesce(p_dj_name, '')))
    and coalesce(a.social_settings->>'discoverByDjName', 'true') = 'true'
    and coalesce(a.social_settings->>'discoverability', 'searchable') = 'searchable'
  limit 20;
$$;

revoke all on function public.get_public_profile_by_dj_name(text) from public;
grant execute on function public.get_public_profile_by_dj_name(text) to authenticated;

create or replace function public.get_song_social_context(
  p_title text,
  p_chart_type text
)
returns table (
  kind text,
  peer_user_id uuid,
  dj_name text,
  infinitas_id text,
  lamp text,
  ex_score int,
  rate numeric,
  score_tier text,
  can_challenge boolean
)
language sql
security definer
set search_path = public
as $$
  with peers as (
    select 'follow'::text as kind,
           case when f.follower_user_id = auth.uid() then f.following_user_id else f.follower_user_id end as peer_id
    from public.follows f
    where auth.uid() in (f.follower_user_id, f.following_user_id)
  ),
  peer_rows as (
    select
      p.kind,
      p.peer_id,
      u.dj_name,
      u.infinitas_id,
      a.social_settings,
      tr.r as row
    from peers p
    join public.users u on u.auth_user_id = p.peer_id
    left join public.account_states a on a.auth_user_id = p.peer_id
    left join lateral (
      select r
      from jsonb_array_elements(coalesce(a.tracker_rows, '[]'::jsonb)) r
      where lower(trim(coalesce(r->>'title', ''))) = lower(trim(coalesce(p_title, '')))
      limit 1
    ) tr on true
  ),
  peer_stats as (
    select
      pr.kind,
      pr.peer_id,
      pr.dj_name,
      pr.infinitas_id,
      case
        when p_chart_type = 'H' then coalesce(pr.row->>'SPH Lamp', 'NP')
        when p_chart_type = 'L' then coalesce(pr.row->>'SPL Lamp', 'NP')
        else coalesce(pr.row->>'SPA Lamp', 'NP')
      end as lamp,
      case
        when p_chart_type = 'H' then coalesce((pr.row->>'SPH EX Score')::int, 0)
        when p_chart_type = 'L' then coalesce((pr.row->>'SPL EX Score')::int, 0)
        else coalesce((pr.row->>'SPA EX Score')::int, 0)
      end as ex_score,
      case
        when p_chart_type = 'H' then coalesce((pr.row->>'SPH Note Count')::int, 0)
        when p_chart_type = 'L' then coalesce((pr.row->>'SPL Note Count')::int, 0)
        else coalesce((pr.row->>'SPA Note Count')::int, 0)
      end as note_count
    from peer_rows pr
  ),
  peer_scores as (
    select
      ps.*,
      case
        when ps.note_count > 0 then round((ps.ex_score::numeric / (ps.note_count * 2)::numeric) * 100, 2)
        else 0::numeric
      end as rate_value
    from peer_stats ps
  )
  select
    ps.kind,
    ps.peer_id as peer_user_id,
    ps.dj_name,
    ps.infinitas_id,
    ps.lamp,
    ps.ex_score,
    ps.rate_value as rate,
    case
      when ps.lamp = 'NP' or ps.note_count <= 0 then ''
      when ps.rate_value >= 100 then 'MAX'
      when ps.rate_value >= 94.4444444444 then 'MAX-'
      when ps.rate_value >= 88.8888888888 then 'AAA'
      when ps.rate_value >= 77.7777777777 then 'AA'
      when ps.rate_value >= 66.6666666666 then 'A'
      when ps.rate_value >= 55.5555555555 then 'B'
      when ps.rate_value >= 44.4444444444 then 'C'
      when ps.rate_value >= 33.3333333333 then 'D'
      when ps.rate_value >= 22.2222222222 then 'E'
      else 'F'
    end as score_tier,
    false as can_challenge
  from peer_scores ps
  where ps.kind = 'follow';
$$;

revoke all on function public.get_song_social_context(text, text) from public;
grant execute on function public.get_song_social_context(text, text) to authenticated;

create or replace function public.send_follow_request(p_target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follow_policy text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_target_user_id = auth.uid() then
    raise exception 'cannot_follow_self';
  end if;
  if (select count(*) from public.follows f where f.follower_user_id = auth.uid()) >= 8 then
    raise exception 'follow_limit_exceeded';
  end if;
  if exists (
    select 1 from public.follows f
    where f.follower_user_id = auth.uid()
      and f.following_user_id = p_target_user_id
  ) then
    return 'already_following';
  end if;

  select coalesce(a.social_settings->>'followPolicy', 'manual')
  into v_follow_policy
  from public.account_states a
  where a.auth_user_id = p_target_user_id;

  if coalesce(v_follow_policy, 'manual') = 'disabled' then
    raise exception 'target_follow_disabled';
  end if;

  if coalesce(v_follow_policy, 'manual') = 'auto' then
    insert into public.follows (follower_user_id, following_user_id)
    values (auth.uid(), p_target_user_id)
    on conflict do nothing;
    return 'auto_accepted';
  end if;

  insert into public.follow_requests (
    requester_user_id,
    target_user_id,
    status
  ) values (
    auth.uid(),
    p_target_user_id,
    'pending'
  );
  return 'requested';
end;
$$;

revoke all on function public.send_follow_request(uuid) from public;
grant execute on function public.send_follow_request(uuid) to authenticated;

create or replace function public.respond_follow_request(
  p_request_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.follow_requests;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select * into v_request
  from public.follow_requests
  where id = p_request_id
    and target_user_id = auth.uid()
    and status = 'pending';
  if not found then
    raise exception 'request_not_found';
  end if;
  if p_accept then
    insert into public.follows (follower_user_id, following_user_id)
    values (v_request.requester_user_id, v_request.target_user_id)
    on conflict do nothing;
    update public.follow_requests
      set status = 'accepted', responded_at = now()
    where id = p_request_id;
    return 'accepted';
  end if;
  update public.follow_requests
    set status = 'rejected', responded_at = now()
  where id = p_request_id;
  return 'rejected';
end;
$$;

revoke all on function public.respond_follow_request(uuid, boolean) from public;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;

create or replace function public.get_social_overview()
returns table (
  relation_type text,
  request_id uuid,
  peer_user_id uuid,
  dj_name text,
  infinitas_id text,
  direction text,
  icon_data_url text,
  status text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    case when fr.target_user_id = auth.uid() then 'request_in' else 'request_out' end as relation_type,
    fr.id as request_id,
    case when fr.target_user_id = auth.uid() then fr.requester_user_id else fr.target_user_id end as peer_user_id,
    u.dj_name,
    u.infinitas_id,
    case when fr.target_user_id = auth.uid() then 'incoming' else 'outgoing' end as direction,
    coalesce(u.icon_data_url, '') as icon_data_url,
    fr.status,
    fr.created_at
  from public.follow_requests fr
  join public.users u on u.auth_user_id = case when fr.target_user_id = auth.uid() then fr.requester_user_id else fr.target_user_id end
  where auth.uid() in (fr.requester_user_id, fr.target_user_id)
  union all
  select
    'follow'::text,
    null::uuid,
    case when f.follower_user_id = auth.uid() then f.following_user_id else f.follower_user_id end as peer_user_id,
    u.dj_name,
    u.infinitas_id,
    case when f.follower_user_id = auth.uid() then 'following' else 'follower' end as direction,
    coalesce(u.icon_data_url, '') as icon_data_url,
    'accepted'::text,
    f.created_at
  from public.follows f
  join public.users u on u.auth_user_id = case when f.follower_user_id = auth.uid() then f.following_user_id else f.follower_user_id end
  where auth.uid() in (f.follower_user_id, f.following_user_id);
$$;

revoke all on function public.get_social_overview() from public;
grant execute on function public.get_social_overview() to authenticated;

create or replace function public.get_follow_lists()
returns table (
  direction text,
  peer_user_id uuid,
  dj_name text,
  infinitas_id text,
  icon_data_url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    case when f.follower_user_id = auth.uid() then 'following' else 'follower' end as direction,
    case when f.follower_user_id = auth.uid() then f.following_user_id else f.follower_user_id end as peer_user_id,
    u.dj_name,
    u.infinitas_id,
    coalesce(u.icon_data_url, '') as icon_data_url,
    f.created_at
  from public.follows f
  join public.users u on u.auth_user_id = case when f.follower_user_id = auth.uid() then f.following_user_id else f.follower_user_id end
  where auth.uid() in (f.follower_user_id, f.following_user_id)
  order by f.created_at desc;
$$;

revoke all on function public.get_follow_lists() from public;
grant execute on function public.get_follow_lists() to authenticated;

create or replace function public.get_follow_tracker_rows(p_peer_user_id uuid)
returns table (
  peer_user_id uuid,
  dj_name text,
  infinitas_id text,
  tracker_rows jsonb
)
language sql
security definer
set search_path = public
as $$
  select
    u.auth_user_id as peer_user_id,
    u.dj_name,
    u.infinitas_id,
    coalesce(a.tracker_rows, '[]'::jsonb) as tracker_rows
  from public.users u
  left join public.account_states a on a.auth_user_id = u.auth_user_id
  where u.auth_user_id = p_peer_user_id
    and exists (
      select 1
      from public.follows f
      where (f.follower_user_id = auth.uid() and f.following_user_id = p_peer_user_id)
         or (f.following_user_id = auth.uid() and f.follower_user_id = p_peer_user_id)
    );
$$;

revoke all on function public.get_follow_tracker_rows(uuid) from public;
grant execute on function public.get_follow_tracker_rows(uuid) to authenticated;

create or replace function public.get_follow_card(p_peer_user_id uuid)
returns table (
  peer_user_id uuid,
  dj_name text,
  infinitas_id text,
  icon_data_url text,
  banner_data_url text,
  tracker_rows jsonb,
  following_count int,
  follower_count int
)
language sql
security definer
set search_path = public
as $$
  select
    u.auth_user_id as peer_user_id,
    u.dj_name,
    u.infinitas_id,
    coalesce(u.icon_data_url, '') as icon_data_url,
    coalesce(a.social_settings->>'bannerDataUrl', '') as banner_data_url,
    coalesce(a.tracker_rows, '[]'::jsonb) as tracker_rows,
    (
      select count(*)
      from public.follows f1
      where f1.follower_user_id = u.auth_user_id
    )::int as following_count,
    (
      select count(*)
      from public.follows f2
      where f2.following_user_id = u.auth_user_id
    )::int as follower_count
  from public.users u
  left join public.account_states a on a.auth_user_id = u.auth_user_id
  where u.auth_user_id = p_peer_user_id
    and exists (
      select 1
      from public.follows f
      where (f.follower_user_id = auth.uid() and f.following_user_id = p_peer_user_id)
         or (f.following_user_id = auth.uid() and f.follower_user_id = p_peer_user_id)
    );
$$;

revoke all on function public.get_follow_card(uuid) from public;
grant execute on function public.get_follow_card(uuid) to authenticated;

create or replace function public.get_follow_history_detail(
  p_peer_user_id uuid,
  p_history_id text
)
returns table (
  peer_user_id uuid,
  dj_name text,
  infinitas_id text,
  history jsonb,
  prev_history jsonb
)
language sql
security definer
set search_path = public
as $$
  with peer as (
    select
      u.auth_user_id as peer_user_id,
      u.dj_name,
      u.infinitas_id,
      coalesce(a.history, '[]'::jsonb) as history_arr
    from public.users u
    left join public.account_states a on a.auth_user_id = u.auth_user_id
    where u.auth_user_id = p_peer_user_id
      and exists (
        select 1
        from public.follows f
        where (f.follower_user_id = auth.uid() and f.following_user_id = p_peer_user_id)
           or (f.following_user_id = auth.uid() and f.follower_user_id = p_peer_user_id)
      )
  ),
  target as (
    select
      (h.ord - 1)::int as idx,
      h.item as history
    from peer p
    cross join lateral jsonb_array_elements(p.history_arr) with ordinality as h(item, ord)
    where coalesce(h.item->>'id', '') = coalesce(p_history_id, '')
    order by h.ord desc
    limit 1
  )
  select
    p.peer_user_id,
    p.dj_name,
    p.infinitas_id,
    t.history,
    case when t.idx > 0 then p.history_arr -> (t.idx - 1) else null end as prev_history
  from peer p
  join target t on true;
$$;

revoke all on function public.get_follow_history_detail(uuid, text) from public;
grant execute on function public.get_follow_history_detail(uuid, text) to authenticated;

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

create or replace function public.send_goal_bundle_to_user(
  p_target_user_id uuid,
  p_goals jsonb,
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
  v_count int := 0;
  v_norm_goals jsonb := '[]'::jsonb;
  v_transfer_id uuid;
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

  select coalesce(jsonb_agg(g), '[]'::jsonb)
  into v_norm_goals
  from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) g
  where coalesce(g->>'title', '') <> '';

  v_count := jsonb_array_length(coalesce(v_norm_goals, '[]'::jsonb));
  if v_count <= 0 then
    return 0;
  end if;

  insert into public.goal_transfers (
    sender_user_id,
    receiver_user_id,
    goals,
    sender_dj_name,
    sender_infinitas_id,
    status
  ) values (
    auth.uid(),
    p_target_user_id,
    v_norm_goals,
    nullif(trim(p_sender_dj_name), ''),
    nullif(trim(p_sender_infinitas_id), ''),
    'pending'
  )
  on conflict (sender_user_id, receiver_user_id) where (status = 'pending')
  do update set
    goals = excluded.goals,
    sender_dj_name = excluded.sender_dj_name,
    sender_infinitas_id = excluded.sender_infinitas_id,
    created_at = now(),
    responded_at = null,
    status = 'pending'
  returning id into v_transfer_id;

  perform public.create_social_feed_event(
    p_target_user_id,
    auth.uid(),
    'goal_transfer_received',
    jsonb_build_object(
      'transfer_id', v_transfer_id::text,
      'goal_count', v_count
    ),
    'goal_transfers',
    v_transfer_id
  );

  return v_count;
end;
$$;

revoke all on function public.send_goal_bundle_to_user(uuid, jsonb, text, text) from public;
grant execute on function public.send_goal_bundle_to_user(uuid, jsonb, text, text) to authenticated;

create or replace function public.respond_goal_transfer(
  p_transfer_id uuid,
  p_accept boolean
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer public.goal_transfers;
  v_tagged_goals jsonb := '[]'::jsonb;
  v_count int := 0;
  v_source text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_transfer
  from public.goal_transfers
  where id = p_transfer_id
    and receiver_user_id = auth.uid()
    and status = 'pending';

  if not found then
    raise exception 'goal_transfer_not_found';
  end if;

  if not p_accept then
    update public.goal_transfers
      set status = 'rejected', responded_at = now()
    where id = p_transfer_id;
    return 'rejected';
  end if;

  v_source := coalesce(nullif(trim(v_transfer.sender_dj_name), ''), '팔로우 목표 전송');

  select coalesce(jsonb_agg(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(g, '{id}', to_jsonb(gen_random_uuid()::text), true),
          '{source}',
          to_jsonb(v_source || case when nullif(trim(v_transfer.sender_infinitas_id), '') is null then '' else ' (' || trim(v_transfer.sender_infinitas_id) || ')' end),
          true
        ),
        '{sender_user_id}',
        to_jsonb(v_transfer.sender_user_id::text),
        true
      ),
      '{transfer_id}',
      to_jsonb(v_transfer.id::text),
      true
    )
  ), '[]'::jsonb)
  into v_tagged_goals
  from jsonb_array_elements(coalesce(v_transfer.goals, '[]'::jsonb)) g
  where coalesce(g->>'title', '') <> '';

  v_count := jsonb_array_length(coalesce(v_tagged_goals, '[]'::jsonb));

  insert into public.account_states (auth_user_id, account_id, goals, social_settings, updated_at, update_reason)
  values (auth.uid(), gen_random_uuid()::text, v_tagged_goals, '{}'::jsonb, now(), 'goal-transfer-accepted')
  on conflict (auth_user_id)
  do update set
    goals = coalesce(public.account_states.goals, '[]'::jsonb) || v_tagged_goals,
    updated_at = now(),
    update_reason = 'goal-transfer-accepted';

  update public.goal_transfers
    set status = 'accepted', responded_at = now()
  where id = p_transfer_id;

  perform public.create_social_feed_event(
    v_transfer.sender_user_id,
    auth.uid(),
    'goal_transfer_accepted',
    jsonb_build_object(
      'transfer_id', v_transfer.id::text,
      'goal_count', v_count
    ),
    'goal_transfers',
    v_transfer.id
  );

  return 'accepted';
end;
$$;

revoke all on function public.respond_goal_transfer(uuid, boolean) from public;
grant execute on function public.respond_goal_transfer(uuid, boolean) to authenticated;

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
  v_existing_bingo jsonb := '{}'::jsonb;
  v_existing_draft jsonb := '{}'::jsonb;
  v_existing_published jsonb := '{}'::jsonb;
  v_saved_boards jsonb := '[]'::jsonb;
  v_empty_cells jsonb := '[]'::jsonb;
  v_new_board jsonb := '{}'::jsonb;
  v_active_board jsonb := '{}'::jsonb;
  v_draft_size int := 3;
  v_keep_draft boolean := false;
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

  select coalesce(a.bingo_state, '{}'::jsonb)
  into v_existing_bingo
  from public.account_states a
  where a.auth_user_id = auth.uid();

  v_existing_draft := coalesce(v_existing_bingo->'draft', '{}'::jsonb);
  v_existing_published := coalesce(v_existing_bingo->'published', '{}'::jsonb);
  v_saved_boards := case
    when jsonb_typeof(v_existing_bingo->'savedBoards') = 'array' then v_existing_bingo->'savedBoards'
    else '[]'::jsonb
  end;
  v_draft_size := greatest(3, least(coalesce((v_existing_draft->>'size')::int, v_size), 5));

  if jsonb_typeof(v_existing_published) = 'object' and v_existing_published <> '{}'::jsonb then
    if coalesce(nullif(v_existing_published->>'id', ''), '') = '' then
      v_existing_published := jsonb_set(v_existing_published, '{id}', to_jsonb(gen_random_uuid()::text), true);
    end if;
    if not exists (
      select 1
      from jsonb_array_elements(v_saved_boards) item
      where coalesce(item->>'id', '') = coalesce(v_existing_published->>'id', '')
    ) then
      v_saved_boards := v_saved_boards || jsonb_build_array(v_existing_published);
    end if;
  end if;

  select exists (
    select 1
    from jsonb_array_elements(coalesce(v_existing_draft->'cells', '[]'::jsonb)) cell
    where cell <> 'null'::jsonb
  ) and coalesce(nullif(v_existing_draft->>'updatedAt', ''), '') <> ''
  into v_keep_draft;

  if not v_keep_draft then
    select coalesce(jsonb_agg('null'::jsonb), '[]'::jsonb)
    into v_empty_cells
    from generate_series(1, v_draft_size * v_draft_size);
    v_existing_draft := jsonb_build_object(
      'size', v_draft_size,
      'cells', v_empty_cells,
      'updatedAt', ''
    );
  end if;

  v_new_board := jsonb_build_object(
    'id', gen_random_uuid()::text,
    'name', v_name,
    'size', v_size,
    'cells', v_cells,
    'savedAt', now(),
    'sharedFromUserId', v_transfer.sender_user_id::text,
    'sharedFromDjName', coalesce(v_transfer.sender_dj_name, ''),
    'sharedFromInfinitasId', coalesce(v_transfer.sender_infinitas_id, ''),
    'completionNotifiedAt', ''
  );

  if exists (
    select 1
    from jsonb_array_elements(v_saved_boards) item
    where coalesce((item->>'size')::int, 0) = v_size
      and coalesce(item->'cells', '[]'::jsonb) = v_cells
  ) then
    select item
    into v_active_board
    from jsonb_array_elements(v_saved_boards) item
    where coalesce((item->>'size')::int, 0) = v_size
      and coalesce(item->'cells', '[]'::jsonb) = v_cells
    limit 1;
  else
    if jsonb_array_length(v_saved_boards) >= 5 then
      raise exception 'bingo_board_limit_exceeded';
    end if;
    v_saved_boards := v_saved_boards || jsonb_build_array(v_new_board);
    v_active_board := v_new_board;
  end if;

  insert into public.account_states (auth_user_id, account_id, bingo_state, social_settings, updated_at, update_reason)
  values (
    auth.uid(),
    gen_random_uuid()::text,
    jsonb_build_object(
      'draft', v_existing_draft,
      'savedBoards', v_saved_boards,
      'activeBoardId', coalesce(v_active_board->>'id', ''),
      'published', v_active_board,
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

create or replace function public.limit_follow_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (
    select count(*)
    from public.follows f
    where f.follower_user_id = new.follower_user_id
  ) >= 8 then
    raise exception 'follow_limit_exceeded';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_limit_follow_insert on public.follows;
create trigger trg_limit_follow_insert
before insert on public.follows
for each row execute procedure public.limit_follow_insert();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at
before update on public.users
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_account_states_updated_at on public.account_states;
create trigger trg_account_states_updated_at
before update on public.account_states
for each row execute procedure public.set_updated_at();

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

drop trigger if exists trg_goal_shares_updated_at on public.goal_shares;
create trigger trg_goal_shares_updated_at
before update on public.goal_shares
for each row execute procedure public.set_updated_at();

create table if not exists public.social_feed_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  ref_table text,
  ref_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists social_feed_events_owner_created_idx
  on public.social_feed_events (owner_user_id, created_at desc);

create table if not exists public.goal_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  receiver_user_id uuid not null references auth.users(id) on delete cascade,
  goals jsonb not null default '[]'::jsonb,
  sender_dj_name text,
  sender_infinitas_id text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint goal_transfers_not_self_chk check (sender_user_id <> receiver_user_id),
  constraint goal_transfers_status_chk check (status in ('pending', 'accepted', 'rejected', 'canceled'))
);

create unique index if not exists goal_transfers_pending_unique
  on public.goal_transfers (sender_user_id, receiver_user_id)
  where status = 'pending';

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

alter table public.social_feed_events enable row level security;
alter table public.goal_transfers enable row level security;
alter table public.bingo_transfers enable row level security;

drop policy if exists social_feed_events_select_owner on public.social_feed_events;
create policy social_feed_events_select_owner on public.social_feed_events
  for select using (auth.uid() = owner_user_id);

drop policy if exists social_feed_events_update_owner on public.social_feed_events;
create policy social_feed_events_update_owner on public.social_feed_events
  for update using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists goal_transfers_select_participants on public.goal_transfers;
create policy goal_transfers_select_participants on public.goal_transfers
  for select using (auth.uid() in (sender_user_id, receiver_user_id));

drop policy if exists goal_transfers_insert_sender on public.goal_transfers;
create policy goal_transfers_insert_sender on public.goal_transfers
  for insert with check (auth.uid() = sender_user_id);

drop policy if exists goal_transfers_update_receiver_sender on public.goal_transfers;
create policy goal_transfers_update_receiver_sender on public.goal_transfers
  for update using (auth.uid() in (sender_user_id, receiver_user_id))
  with check (auth.uid() in (sender_user_id, receiver_user_id));

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

create or replace function public.create_social_feed_event(
  p_owner_user_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_payload jsonb default '{}'::jsonb,
  p_ref_table text default null,
  p_ref_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.social_feed_events (
    owner_user_id,
    actor_user_id,
    event_type,
    payload,
    ref_table,
    ref_id
  )
  values (
    p_owner_user_id,
    p_actor_user_id,
    p_event_type,
    coalesce(p_payload, '{}'::jsonb),
    p_ref_table,
    p_ref_id
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.create_social_feed_event(uuid, uuid, text, jsonb, text, uuid) from public;
grant execute on function public.create_social_feed_event(uuid, uuid, text, jsonb, text, uuid) to authenticated;

create or replace function public.feed_follow_request_insert_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform public.create_social_feed_event(
      new.target_user_id,
      new.requester_user_id,
      'follow_request_received',
      jsonb_build_object('request_id', new.id::text),
      'follow_requests',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feed_follow_request_insert on public.follow_requests;
create trigger trg_feed_follow_request_insert
after insert on public.follow_requests
for each row execute procedure public.feed_follow_request_insert_trigger();

create or replace function public.feed_follow_request_update_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status <> 'accepted' and new.status = 'accepted' then
    perform public.create_social_feed_event(
      new.requester_user_id,
      new.target_user_id,
      'follow_request_accepted',
      jsonb_build_object('request_id', new.id::text),
      'follow_requests',
      new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_feed_follow_request_update on public.follow_requests;
create trigger trg_feed_follow_request_update
after update on public.follow_requests
for each row execute procedure public.feed_follow_request_update_trigger();

create or replace function public.feed_follows_delete_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.create_social_feed_event(
    old.following_user_id,
    old.follower_user_id,
    'follower_unfollowed',
    '{}'::jsonb,
    'follows',
    null
  );
  return old;
end;
$$;

drop trigger if exists trg_feed_follows_delete on public.follows;
create trigger trg_feed_follows_delete
after delete on public.follows
for each row execute procedure public.feed_follows_delete_trigger();

create or replace function public.feed_history_update_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_count int;
  v_new_count int;
  v_last jsonb;
  v_follower uuid;
begin
  v_old_count := coalesce(jsonb_array_length(coalesce(old.history, '[]'::jsonb)), 0);
  v_new_count := coalesce(jsonb_array_length(coalesce(new.history, '[]'::jsonb)), 0);
  if v_new_count <= v_old_count then
    return new;
  end if;
  v_last := coalesce(new.history -> (v_new_count - 1), '{}'::jsonb);
  for v_follower in
    select f.follower_user_id
    from public.follows f
    where f.following_user_id = new.auth_user_id
  loop
    perform public.create_social_feed_event(
      v_follower,
      new.auth_user_id,
      'follow_history_updated',
      jsonb_build_object(
        'history_id', coalesce(v_last->>'id', ''),
        'summary', coalesce(v_last->>'summary', '')
      ),
      'account_states',
      null
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_feed_history_update on public.account_states;
create trigger trg_feed_history_update
after update on public.account_states
for each row execute procedure public.feed_history_update_trigger();

create or replace function public.feed_goal_update_trigger()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rec record;
begin
  if coalesce(new.update_reason, '') like 'goal-transfer%' then
    return new;
  end if;
  if coalesce(new.goals, '[]'::jsonb) = coalesce(old.goals, '[]'::jsonb) then
    return new;
  end if;
  for v_rec in
    with old_goals as (
      select g->>'id' as goal_id, g as goal
      from jsonb_array_elements(coalesce(old.goals, '[]'::jsonb)) g
    ),
    new_goals as (
      select
        g->>'id' as goal_id,
        g as goal,
        nullif(g->>'sender_user_id', '')::uuid as sender_user_id
      from jsonb_array_elements(coalesce(new.goals, '[]'::jsonb)) g
    ),
    changed as (
      select
        ng.sender_user_id,
        count(*)::int as changed_count
      from new_goals ng
      left join old_goals og on og.goal_id = ng.goal_id
      where ng.sender_user_id is not null
        and (og.goal is null or og.goal is distinct from ng.goal)
      group by ng.sender_user_id
    )
    select * from changed
  loop
    perform public.create_social_feed_event(
      v_rec.sender_user_id,
      new.auth_user_id,
      'goal_transfer_updated',
      jsonb_build_object('changed_count', v_rec.changed_count),
      'account_states',
      null
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_feed_goal_update on public.account_states;
create trigger trg_feed_goal_update
after update on public.account_states
for each row execute procedure public.feed_goal_update_trigger();

create or replace function public.get_feed_events(p_limit int default 100)
returns table (
  id uuid,
  event_type text,
  actor_user_id uuid,
  actor_dj_name text,
  actor_infinitas_id text,
  actor_icon_data_url text,
  payload jsonb,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.event_type,
    e.actor_user_id,
    coalesce(u.dj_name, '') as actor_dj_name,
    coalesce(u.infinitas_id, '') as actor_infinitas_id,
    coalesce(u.icon_data_url, '') as actor_icon_data_url,
    e.payload,
    e.created_at
  from public.social_feed_events e
  left join public.users u on u.auth_user_id = e.actor_user_id
  where e.owner_user_id = auth.uid()
    and e.dismissed_at is null
  order by e.created_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 300));
$$;

revoke all on function public.get_feed_events(int) from public;
grant execute on function public.get_feed_events(int) to authenticated;

create or replace function public.dismiss_feed_event(p_event_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  update public.social_feed_events
  set dismissed_at = now()
  where id = p_event_id
    and owner_user_id = auth.uid()
    and dismissed_at is null
  returning true;
$$;

revoke all on function public.dismiss_feed_event(uuid) from public;
grant execute on function public.dismiss_feed_event(uuid) to authenticated;

create or replace function public.dismiss_all_feed_events()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.social_feed_events
  set dismissed_at = now()
  where owner_user_id = auth.uid()
    and dismissed_at is null;
  get diagnostics v_count = row_count;
  return coalesce(v_count, 0);
end;
$$;

revoke all on function public.dismiss_all_feed_events() from public;
grant execute on function public.dismiss_all_feed_events() to authenticated;

create table if not exists public.chart_metadata (
  id bigint generated by default as identity primary key,
  chart_key text not null unique,
  table_key text not null,
  table_title text not null,
  level smallint not null,
  song_title text not null,
  normalized_title text not null,
  chart_type text not null,
  category text not null default '미분류',
  source_sort_index integer not null default 999,
  classification_status text not null default 'uncategorized',
  bpm text not null default '',
  note_count integer not null default 0,
  type_info text not null default '',
  radar_notes numeric(6,2) not null default 0,
  radar_peak numeric(6,2) not null default 0,
  radar_scratch numeric(6,2) not null default 0,
  radar_soflan numeric(6,2) not null default 0,
  radar_charge numeric(6,2) not null default 0,
  radar_chord numeric(6,2) not null default 0,
  radar_top text not null default '',
  source text not null default 'manual',
  is_deleted boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chart_metadata_table_key_chk check (table_key in ('SP10H', 'SP11H', 'SP12H')),
  constraint chart_metadata_level_chk check (level between 10 and 12),
  constraint chart_metadata_chart_type_chk check (chart_type in ('H', 'A', 'L')),
  constraint chart_metadata_classification_status_chk check (classification_status in ('classified', 'provisional', 'uncategorized'))
);

create index if not exists chart_metadata_table_category_idx
  on public.chart_metadata (table_key, source_sort_index, category);

create index if not exists chart_metadata_title_idx
  on public.chart_metadata (normalized_title, chart_type);

create index if not exists chart_metadata_lookup_idx
  on public.chart_metadata (is_deleted, table_key, source_sort_index);

drop trigger if exists trg_chart_metadata_updated_at on public.chart_metadata;
create trigger trg_chart_metadata_updated_at
before update on public.chart_metadata
for each row execute procedure public.set_updated_at();

create or replace function public.admin_update_chart_metadata(
  p_chart_key text,
  p_table_key text,
  p_song_title text,
  p_chart_type text,
  p_category text,
  p_source_sort_index integer,
  p_note_count integer,
  p_type_info text,
  p_bpm text,
  p_radar_notes numeric,
  p_radar_peak numeric,
  p_radar_scratch numeric,
  p_radar_soflan numeric,
  p_radar_charge numeric,
  p_radar_chord numeric
)
returns public.chart_metadata
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_category text := coalesce(nullif(trim(p_category), ''), '미분류');
  v_sort_index integer := greatest(coalesce(p_source_sort_index, 999), -999);
  v_note_count integer := greatest(coalesce(p_note_count, 0), 0);
  v_type_info text := upper(coalesce(nullif(trim(p_type_info), ''), ''));
  v_bpm text := coalesce(trim(p_bpm), '');
  v_radar_notes numeric(6,2) := round(greatest(coalesce(p_radar_notes, 0), 0)::numeric, 2);
  v_radar_peak numeric(6,2) := round(greatest(coalesce(p_radar_peak, 0), 0)::numeric, 2);
  v_radar_scratch numeric(6,2) := round(greatest(coalesce(p_radar_scratch, 0), 0)::numeric, 2);
  v_radar_soflan numeric(6,2) := round(greatest(coalesce(p_radar_soflan, 0), 0)::numeric, 2);
  v_radar_charge numeric(6,2) := round(greatest(coalesce(p_radar_charge, 0), 0)::numeric, 2);
  v_radar_chord numeric(6,2) := round(greatest(coalesce(p_radar_chord, 0), 0)::numeric, 2);
  v_radar_top text;
  v_status text;
  v_row public.chart_metadata%rowtype;
begin
  if v_email <> 'qscse75359@gmail.com' then
    raise exception 'admin_only';
  end if;

  v_radar_top := case greatest(v_radar_notes, v_radar_peak, v_radar_scratch, v_radar_soflan, v_radar_charge, v_radar_chord)
    when v_radar_notes then 'NOTES'
    when v_radar_peak then 'PEAK'
    when v_radar_scratch then 'SCRATCH'
    when v_radar_soflan then 'SOFLAN'
    when v_radar_charge then 'CHARGE'
    else 'CHORD'
  end;

  v_status := case
    when v_category = '미정' then 'provisional'
    when v_category = '미분류' then 'uncategorized'
    else 'classified'
  end;

  update public.chart_metadata
  set
    category = v_category,
    source_sort_index = v_sort_index,
    classification_status = v_status,
    bpm = v_bpm,
    note_count = v_note_count,
    type_info = coalesce(nullif(v_type_info, ''), v_radar_top),
    radar_notes = v_radar_notes,
    radar_peak = v_radar_peak,
    radar_scratch = v_radar_scratch,
    radar_soflan = v_radar_soflan,
    radar_charge = v_radar_charge,
    radar_chord = v_radar_chord,
    radar_top = v_radar_top,
    source = 'admin_chart_metadata_rpc',
    updated_by = auth.uid()
  where chart_key = p_chart_key
    or (
      table_key = p_table_key
      and song_title = p_song_title
      and chart_type = upper(coalesce(p_chart_type, ''))
    )
  returning * into v_row;

  if not found then
    raise exception 'chart_not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_chart_metadata(text, text, text, text, text, integer, integer, text, text, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.admin_update_chart_metadata(text, text, text, text, text, integer, integer, text, text, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

create or replace function public.admin_delete_chart_metadata(
  p_chart_key text,
  p_table_key text,
  p_song_title text,
  p_chart_type text
)
returns public.chart_metadata
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_row public.chart_metadata%rowtype;
begin
  if v_email <> 'qscse75359@gmail.com' then
    raise exception 'admin_only';
  end if;

  update public.chart_metadata
  set
    is_deleted = true,
    source = 'admin_chart_metadata_rpc',
    updated_by = auth.uid()
  where is_deleted = false
    and (
      chart_key = p_chart_key
      or (
        table_key = p_table_key
        and song_title = p_song_title
        and chart_type = upper(coalesce(p_chart_type, ''))
      )
    )
  returning * into v_row;

  if not found then
    raise exception 'chart_not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_delete_chart_metadata(text, text, text, text) from public;
grant execute on function public.admin_delete_chart_metadata(text, text, text, text) to authenticated;

create table if not exists public.app_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  items jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_email text not null default '',
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_notices_items_array_chk check (jsonb_typeof(items) = 'array')
);

create index if not exists app_notices_published_at_idx
  on public.app_notices (published_at desc, created_at desc);

alter table public.app_notices enable row level security;

grant select on table public.app_notices to anon, authenticated;
grant insert, update on table public.app_notices to authenticated;

create policy app_notices_select_all on public.app_notices
  for select
  to anon, authenticated
  using (true);

create policy app_notices_insert_admin on public.app_notices
  for insert
  to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com');

create policy app_notices_update_admin on public.app_notices
  for update
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com');

drop trigger if exists trg_app_notices_updated_at on public.app_notices;
create trigger trg_app_notices_updated_at
before update on public.app_notices
for each row execute procedure public.set_updated_at();
