drop function if exists public.get_song_social_context(text, text);

create function public.get_song_social_context(
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
