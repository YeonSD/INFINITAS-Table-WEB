alter table public.chart_metadata
  add column if not exists release_status text not null default 'live';

alter table public.chart_metadata
  drop constraint if exists chart_metadata_release_status_chk;

alter table public.chart_metadata
  add constraint chart_metadata_release_status_chk check (release_status in ('live', 'pending_release'));

create or replace function public.admin_set_chart_release_status(
  p_chart_key text,
  p_table_key text,
  p_song_title text,
  p_chart_type text,
  p_release_status text
)
returns public.chart_metadata
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_release_status text := case
    when lower(coalesce(trim(p_release_status), '')) = 'pending_release' then 'pending_release'
    else 'live'
  end;
  v_row public.chart_metadata%rowtype;
begin
  if v_email <> 'qscse75359@gmail.com' then
    raise exception 'admin_only';
  end if;

  update public.chart_metadata
  set
    release_status = v_release_status,
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

revoke all on function public.admin_set_chart_release_status(text, text, text, text, text) from public;
grant execute on function public.admin_set_chart_release_status(text, text, text, text, text) to authenticated;
