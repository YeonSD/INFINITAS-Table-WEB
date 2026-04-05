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
