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
