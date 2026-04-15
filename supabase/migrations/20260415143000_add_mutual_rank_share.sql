create or replace function public.get_mutual_rank_tracker_rows(p_peer_user_id uuid)
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
    and coalesce(a.social_settings->>'shareRankTableWithMutuals', 'true') <> 'false'
    and exists (
      select 1
      from public.follows f
      where f.follower_user_id = auth.uid()
        and f.following_user_id = p_peer_user_id
    )
    and exists (
      select 1
      from public.follows f
      where f.follower_user_id = p_peer_user_id
        and f.following_user_id = auth.uid()
    );
$$;

revoke all on function public.get_mutual_rank_tracker_rows(uuid) from public;
grant execute on function public.get_mutual_rank_tracker_rows(uuid) to authenticated;
