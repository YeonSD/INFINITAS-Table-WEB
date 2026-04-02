create table if not exists public.app_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text not null,
  items jsonb not null default '[]'::jsonb,
  published_at timestamptz not null default now(),
  created_by_user_id uuid references auth.users(id) on delete set null,
  created_by_email text not null default '',
  updated_by_user_id uuid references auth.users(id) on delete set null,
  updated_by_email text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_notices_items_array_chk check (jsonb_typeof(items) = 'array')
);

create index if not exists app_notices_published_at_idx
  on public.app_notices (published_at desc, created_at desc);

alter table public.app_notices enable row level security;

grant select on table public.app_notices to anon, authenticated;
grant insert, update on table public.app_notices to authenticated;

drop policy if exists app_notices_select_all on public.app_notices;
create policy app_notices_select_all on public.app_notices
  for select
  to anon, authenticated
  using (true);

drop policy if exists app_notices_insert_admin on public.app_notices;
create policy app_notices_insert_admin on public.app_notices
  for insert
  to authenticated
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com');

drop policy if exists app_notices_update_admin on public.app_notices;
create policy app_notices_update_admin on public.app_notices
  for update
  to authenticated
  using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com')
  with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'qscse75359@gmail.com');

drop trigger if exists trg_app_notices_updated_at on public.app_notices;
create trigger trg_app_notices_updated_at
before update on public.app_notices
for each row execute procedure public.set_updated_at();

insert into public.app_notices (
  title,
  summary,
  items,
  published_at,
  created_by_email,
  updated_by_email
)
select
  'SP11 신규 수록곡 데이터 반영',
  'MA・TSU・RI와 ABSOLUTE (kors k Remix)를 서열표와 노트 레이더에 반영했습니다.',
  '[
    "2026년 04월 01일 추가곡인 MA・TSU・RI SPA 11 데이터를 정적 스냅샷에 반영했습니다.",
    "2026년 04월 01일 추가곡인 ABSOLUTE (kors k Remix) SPA 11 데이터를 정적 스냅샷에 반영했습니다.",
    "TSV 업로드 전에도 두 곡이 목록에 표시되고, 업로드 후에는 노트 레이더까지 정상 표시됩니다."
  ]'::jsonb,
  '2026-04-02T12:00:00.000Z'::timestamptz,
  'system',
  'system'
where not exists (
  select 1
  from public.app_notices
);
