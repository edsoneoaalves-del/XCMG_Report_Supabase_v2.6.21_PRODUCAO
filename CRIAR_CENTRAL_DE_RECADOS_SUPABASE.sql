-- XCMG REPORT v2.11.0 — Central de Recados
-- Execute uma única vez no SQL Editor do Supabase.

create table if not exists public.xcmg_messages (
  id text primary key,
  subject text not null,
  body text not null,
  sender_id text not null,
  sender_name text not null,
  sender_team text,
  recipient_type text not null check (recipient_type in ('user','all')),
  recipient_id text,
  recipient_name text,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  equipment text,
  read_by jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists xcmg_messages_created_at_idx on public.xcmg_messages (created_at desc);
create index if not exists xcmg_messages_recipient_idx on public.xcmg_messages (recipient_id, recipient_type);
create index if not exists xcmg_messages_sender_idx on public.xcmg_messages (sender_id);

alter table public.xcmg_messages enable row level security;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.xcmg_messages to anon, authenticated;

drop policy if exists "xcmg_messages_select" on public.xcmg_messages;
drop policy if exists "xcmg_messages_insert" on public.xcmg_messages;
drop policy if exists "xcmg_messages_update" on public.xcmg_messages;
drop policy if exists "xcmg_messages_delete" on public.xcmg_messages;

create policy "xcmg_messages_select" on public.xcmg_messages for select using (true);
create policy "xcmg_messages_insert" on public.xcmg_messages for insert with check (true);
create policy "xcmg_messages_update" on public.xcmg_messages for update using (true) with check (true);
create policy "xcmg_messages_delete" on public.xcmg_messages for delete using (true);

select id, subject, sender_name, recipient_name, created_at from public.xcmg_messages order by created_at desc limit 5;
