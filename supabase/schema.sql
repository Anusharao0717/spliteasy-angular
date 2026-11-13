-- SplitEasy starter schema.
-- Run in Supabase SQL Editor after creating the project.
-- All application tables are protected by RLS. Group owners can manage
-- their groups and related records. Extend membership policies before
-- enabling shared access for other authenticated users.

create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  bill_date date not null default current_date,
  subtotal numeric(12,2) not null default 0,
  discount numeric(12,2) not null default 0,
  handling_charge numeric(12,2) not null default 0,
  delivery_charge numeric(12,2) not null default 0,
  surge_charge numeric(12,2) not null default 0,
  receipt_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  name text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  assignee_ids uuid[] not null default '{}'
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(12,2) not null default 0,
  paid boolean not null default false,
  paid_at timestamptz,
  unique (bill_id, member_id)
);

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.payments enable row level security;

drop policy if exists "owners manage own groups" on public.groups;
create policy "owners manage own groups" on public.groups
for all to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

drop policy if exists "owners manage group members" on public.members;
create policy "owners manage group members" on public.members
for all to authenticated
using (exists (
  select 1 from public.groups g
  where g.id = members.group_id and g.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.groups g
  where g.id = members.group_id and g.owner_id = (select auth.uid())
));

drop policy if exists "owners manage group bills" on public.bills;
create policy "owners manage group bills" on public.bills
for all to authenticated
using (exists (
  select 1 from public.groups g
  where g.id = bills.group_id and g.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.groups g
  where g.id = bills.group_id and g.owner_id = (select auth.uid())
));

drop policy if exists "owners manage bill items" on public.bill_items;
create policy "owners manage bill items" on public.bill_items
for all to authenticated
using (exists (
  select 1 from public.bills b
  join public.groups g on g.id = b.group_id
  where b.id = bill_items.bill_id and g.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.bills b
  join public.groups g on g.id = b.group_id
  where b.id = bill_items.bill_id and g.owner_id = (select auth.uid())
));

drop policy if exists "owners manage bill payments" on public.payments;
create policy "owners manage bill payments" on public.payments
for all to authenticated
using (exists (
  select 1 from public.bills b
  join public.groups g on g.id = b.group_id
  where b.id = payments.bill_id and g.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.bills b
  join public.groups g on g.id = b.group_id
  where b.id = payments.bill_id and g.owner_id = (select auth.uid())
));

-- Create a PRIVATE storage bucket. Receipt upload/read policies are scoped
-- to the owning user's group folders in the app's recommended production design.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Storage object path format is {group_id}/{filename}.
-- This policy checks that the folder belongs to a group owned by the signed-in user.
drop policy if exists "owners upload group receipts" on storage.objects;
create policy "owners upload group receipts" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.groups g
    where g.id::text = (storage.foldername(name))[1]
      and g.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners read group receipts" on storage.objects;
create policy "owners read group receipts" on storage.objects
for select to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.groups g
    where g.id::text = (storage.foldername(name))[1]
      and g.owner_id = (select auth.uid())
  )
);

drop policy if exists "owners delete group receipts" on storage.objects;
create policy "owners delete group receipts" on storage.objects
for delete to authenticated
using (
  bucket_id = 'receipts'
  and exists (
    select 1 from public.groups g
    where g.id::text = (storage.foldername(name))[1]
      and g.owner_id = (select auth.uid())
  )
);
