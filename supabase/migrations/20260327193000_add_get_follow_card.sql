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
