-- XCMG Report v2.6.20
-- Execute TODO este conteúdo uma única vez no SQL Editor do Supabase.

create table if not exists public.app_storage (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.app_storage enable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.app_storage to anon, authenticated;

drop policy if exists "app_storage_select" on public.app_storage;
drop policy if exists "app_storage_insert" on public.app_storage;
drop policy if exists "app_storage_update" on public.app_storage;
drop policy if exists "app_storage_delete" on public.app_storage;

create policy "app_storage_select"
on public.app_storage for select
using (true);

create policy "app_storage_insert"
on public.app_storage for insert
with check (true);

create policy "app_storage_update"
on public.app_storage for update
using (true)
with check (true);

create policy "app_storage_delete"
on public.app_storage for delete
using (true);

-- Teste opcional: deve retornar a tabela sem erro.
select key, updated_at from public.app_storage limit 5;
