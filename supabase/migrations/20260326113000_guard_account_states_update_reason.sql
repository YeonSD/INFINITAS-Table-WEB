create or replace function public.guard_account_states_update_reason()
returns trigger
language plpgsql
as $$
declare
  v_reason text := coalesce(new.update_reason, '');
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  if v_role = 'service_role' then
    return new;
  end if;

  if v_reason = '' then
    raise exception 'account_states.update_reason is required';
  end if;

  if v_reason <> all (array[
    'profile-save',
    'tsv-upload',
    'history-rollback',
    'goal-import',
    'settings-save',
    'social-banner',
    'goal-clear',
    'goal-clear-achieved',
    'goal-delete',
    'goal-save',
    'goal-transfer-accepted'
  ]) then
    raise exception 'account_states.update_reason "%" is not allowed', v_reason;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_account_states_update_reason on public.account_states;
create trigger trg_guard_account_states_update_reason
before insert or update on public.account_states
for each row execute procedure public.guard_account_states_update_reason();
