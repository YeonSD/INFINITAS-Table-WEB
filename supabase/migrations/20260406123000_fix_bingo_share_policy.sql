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
