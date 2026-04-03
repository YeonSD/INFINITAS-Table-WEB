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
