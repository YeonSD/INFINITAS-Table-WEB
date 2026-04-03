create or replace function public.admin_update_chart_metadata(
  p_chart_key text,
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
  returning * into v_row;

  if not found then
    raise exception 'chart_not_found';
  end if;

  return v_row;
end;
$$;

revoke all on function public.admin_update_chart_metadata(text, text, integer, integer, text, text, numeric, numeric, numeric, numeric, numeric, numeric) from public;
grant execute on function public.admin_update_chart_metadata(text, text, integer, integer, text, text, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated;

update public.chart_metadata
set
  category = '미분류',
  source_sort_index = 999,
  classification_status = 'uncategorized',
  source = 'manual_chart_metadata_override'
where chart_key in (
  'SP11H|absolute(kors k remix)|A',
  'SP11H|ma・tsu・ri|A'
);
