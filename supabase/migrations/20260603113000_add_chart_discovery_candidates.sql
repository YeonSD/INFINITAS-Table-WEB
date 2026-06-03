create table if not exists public.chart_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  chart_key text not null unique,
  table_key text not null,
  level smallint not null,
  song_title text not null,
  normalized_title text not null,
  chart_type text not null,
  note_count integer not null default 0,
  rating integer not null default 0,
  first_seen_by uuid references auth.users(id) on delete set null,
  last_seen_by uuid references auth.users(id) on delete set null,
  first_seen_history_id text not null default '',
  last_seen_history_id text not null default '',
  seen_count integer not null default 1,
  status text not null default 'new',
  promoted_chart_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chart_discovery_candidates_table_key_chk check (table_key in ('SP10H', 'SP11H', 'SP12H')),
  constraint chart_discovery_candidates_level_chk check (level between 10 and 12),
  constraint chart_discovery_candidates_chart_type_chk check (chart_type in ('H', 'A', 'L')),
  constraint chart_discovery_candidates_note_count_chk check (note_count >= 0),
  constraint chart_discovery_candidates_seen_count_chk check (seen_count > 0),
  constraint chart_discovery_candidates_status_chk check (status in ('new', 'pending', 'promoted', 'dismissed'))
);

create index if not exists chart_discovery_candidates_status_updated_idx
  on public.chart_discovery_candidates (status, updated_at desc);

alter table public.chart_discovery_candidates enable row level security;

drop policy if exists chart_discovery_candidates_admin_select on public.chart_discovery_candidates;
create policy chart_discovery_candidates_admin_select on public.chart_discovery_candidates
  for select
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com');

drop trigger if exists trg_chart_discovery_candidates_updated_at on public.chart_discovery_candidates;
create trigger trg_chart_discovery_candidates_updated_at
before update on public.chart_discovery_candidates
for each row execute procedure public.set_updated_at();

create or replace function public.report_chart_discovery_candidates(
  p_candidates jsonb,
  p_history_id text default ''
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_chart_key text;
  v_table_key text;
  v_level integer;
  v_song_title text;
  v_normalized_title text;
  v_chart_type text;
  v_note_count integer;
  v_candidate_id uuid;
  v_admin_user_id uuid;
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'auth_required';
  end if;
  if jsonb_typeof(coalesce(p_candidates, '[]'::jsonb)) <> 'array' then
    return 0;
  end if;

  for v_item in
    select value from jsonb_array_elements(coalesce(p_candidates, '[]'::jsonb))
  loop
    v_table_key := upper(coalesce(nullif(trim(v_item->>'tableKey'), ''), ''));
    v_level := greatest(0, coalesce(nullif(v_item->>'level', '')::integer, 0));
    v_song_title := coalesce(nullif(trim(v_item->>'songTitle'), ''), '');
    v_normalized_title := lower(coalesce(nullif(trim(v_item->>'normalizedTitle'), ''), nullif(trim(v_item->>'songTitle'), ''), ''));
    v_chart_type := upper(coalesce(nullif(trim(v_item->>'chartType'), ''), ''));
    v_note_count := greatest(0, coalesce(nullif(v_item->>'noteCount', '')::integer, 0));
    v_chart_key := coalesce(nullif(trim(v_item->>'chartKey'), ''), concat(v_table_key, '|', v_normalized_title, '|', v_chart_type));

    if v_table_key not in ('SP10H', 'SP11H', 'SP12H')
      or v_level not between 10 and 12
      or v_song_title = ''
      or v_chart_type not in ('H', 'A', 'L')
      or v_note_count <= 0
      or v_chart_key = ''
    then
      continue;
    end if;

    if exists (
      select 1
      from public.chart_metadata cm
      where cm.is_deleted = false
        and (
          cm.chart_key = v_chart_key
          or (
            cm.table_key = v_table_key
            and cm.song_title = v_song_title
            and cm.chart_type = v_chart_type
          )
        )
    ) then
      continue;
    end if;

    select id into v_candidate_id
    from public.chart_discovery_candidates
    where chart_key = v_chart_key;

    if v_candidate_id is null then
      insert into public.chart_discovery_candidates (
        chart_key,
        table_key,
        level,
        song_title,
        normalized_title,
        chart_type,
        note_count,
        rating,
        first_seen_by,
        last_seen_by,
        first_seen_history_id,
        last_seen_history_id
      )
      values (
        v_chart_key,
        v_table_key,
        v_level,
        v_song_title,
        v_normalized_title,
        v_chart_type,
        v_note_count,
        v_level,
        auth.uid(),
        auth.uid(),
        coalesce(trim(p_history_id), ''),
        coalesce(trim(p_history_id), '')
      )
      returning id into v_candidate_id;

      for v_admin_user_id in
        select auth_user_id from public.users where lower(coalesce(google_email, '')) = 'qscse75359@gmail.com'
      loop
        perform public.create_social_feed_event(
          v_admin_user_id,
          auth.uid(),
          'chart_discovery_candidate',
          jsonb_build_object(
            'candidate_id', v_candidate_id,
            'chart_key', v_chart_key,
            'table_key', v_table_key,
            'song_title', v_song_title,
            'chart_type', v_chart_type,
            'note_count', v_note_count,
            'history_id', coalesce(trim(p_history_id), '')
          ),
          'chart_discovery_candidates',
          v_candidate_id
        );
      end loop;
    else
      update public.chart_discovery_candidates
      set
        note_count = greatest(chart_discovery_candidates.note_count, v_note_count),
        last_seen_by = auth.uid(),
        last_seen_history_id = coalesce(trim(p_history_id), ''),
        seen_count = chart_discovery_candidates.seen_count + 1,
        status = case when status = 'dismissed' then 'new' else status end
      where id = v_candidate_id;
    end if;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.report_chart_discovery_candidates(jsonb, text) from public;
grant execute on function public.report_chart_discovery_candidates(jsonb, text) to authenticated;

create or replace function public.get_chart_discovery_candidates(p_limit int default 80)
returns table (
  id uuid,
  chart_key text,
  table_key text,
  level smallint,
  song_title text,
  normalized_title text,
  chart_type text,
  note_count integer,
  rating integer,
  seen_count integer,
  status text,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  first_seen_history_id text,
  last_seen_history_id text,
  reporter_dj_name text,
  reporter_infinitas_id text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.chart_key,
    c.table_key,
    c.level,
    c.song_title,
    c.normalized_title,
    c.chart_type,
    c.note_count,
    c.rating,
    c.seen_count,
    c.status,
    c.created_at as first_seen_at,
    c.updated_at as last_seen_at,
    c.first_seen_history_id,
    c.last_seen_history_id,
    coalesce(u.dj_name, '') as reporter_dj_name,
    coalesce(u.infinitas_id, '') as reporter_infinitas_id
  from public.chart_discovery_candidates c
  left join public.users u on u.auth_user_id = c.first_seen_by
  where lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com'
    and c.status = 'new'
  order by c.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 200));
$$;

revoke all on function public.get_chart_discovery_candidates(int) from public;
grant execute on function public.get_chart_discovery_candidates(int) to authenticated;

create or replace function public.admin_promote_chart_discovery_candidate(
  p_candidate_id uuid,
  p_category text default '미정',
  p_source_sort_index integer default 0
)
returns public.chart_metadata
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_candidate public.chart_discovery_candidates%rowtype;
  v_category text := coalesce(nullif(trim(p_category), ''), '미정');
  v_sort_index integer := greatest(coalesce(p_source_sort_index, 0), -999);
  v_status text;
  v_row public.chart_metadata%rowtype;
begin
  if v_email <> 'qscse75359@gmail.com' then
    raise exception 'admin_only';
  end if;

  select * into v_candidate
  from public.chart_discovery_candidates
  where id = p_candidate_id;

  if not found then
    raise exception 'candidate_not_found';
  end if;

  v_status := case
    when v_category = '미정' then 'provisional'
    when v_category = '미분류' then 'uncategorized'
    else 'classified'
  end;

  insert into public.chart_metadata (
    chart_key,
    table_key,
    table_title,
    level,
    song_title,
    normalized_title,
    chart_type,
    category,
    source_sort_index,
    classification_status,
    note_count,
    type_info,
    radar_top,
    source,
    release_status,
    is_deleted,
    updated_by
  )
  values (
    v_candidate.chart_key,
    v_candidate.table_key,
    concat('IIDX INFINITAS SP ★', v_candidate.level, ' Hard Gauge Rank'),
    v_candidate.level,
    v_candidate.song_title,
    v_candidate.normalized_title,
    v_candidate.chart_type,
    v_category,
    v_sort_index,
    v_status,
    v_candidate.note_count,
    'NOTES',
    'NOTES',
    'chart_discovery_candidate',
    'pending_release',
    false,
    auth.uid()
  )
  on conflict (chart_key) do update
  set
    category = excluded.category,
    source_sort_index = excluded.source_sort_index,
    classification_status = excluded.classification_status,
    note_count = greatest(chart_metadata.note_count, excluded.note_count),
    type_info = coalesce(nullif(chart_metadata.type_info, ''), excluded.type_info),
    radar_top = coalesce(nullif(chart_metadata.radar_top, ''), excluded.radar_top),
    source = 'chart_discovery_candidate',
    release_status = 'pending_release',
    is_deleted = false,
    updated_by = auth.uid()
  returning * into v_row;

  update public.chart_discovery_candidates
  set
    status = 'pending',
    promoted_chart_key = v_row.chart_key
  where id = p_candidate_id;

  return v_row;
end;
$$;

revoke all on function public.admin_promote_chart_discovery_candidate(uuid, text, integer) from public;
grant execute on function public.admin_promote_chart_discovery_candidate(uuid, text, integer) to authenticated;
