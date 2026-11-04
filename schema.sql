-- SplitEasy database schema. Run this in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.bills (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  title text not null,
  bill_date date not null default current_date,
  subtotal numeric(12,2) not null default 0 check (subtotal >= 0),
  discount numeric(12,2) not null default 0 check (discount >= 0),
  handling_charge numeric(12,2) not null default 0 check (handling_charge >= 0),
  delivery_charge numeric(12,2) not null default 0 check (delivery_charge >= 0),
  surge_charge numeric(12,2) not null default 0 check (surge_charge >= 0),
  receipt_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.bill_items (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  name text not null,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  assignee_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  bill_id uuid not null references public.bills(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  amount numeric(12,2) not null default 0 check (amount >= 0),
  paid boolean not null default false,
  paid_at timestamptz,
  unique (bill_id, member_id)
);

alter table public.groups enable row level security;
alter table public.members enable row level security;
alter table public.bills enable row level security;
alter table public.bill_items enable row level security;
alter table public.payments enable row level security;

-- Group owner is the authenticated user. These policies grant group data access
-- only to the owner. If you later invite authenticated collaborators, add a
-- group_members table and policies for those memberships.
create policy "owners manage own groups" on public.groups
for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "owners manage group members" on public.members
for all to authenticated
using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()))
with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

create policy "owners manage group bills" on public.bills
for all to authenticated
using (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()))
with check (exists (select 1 from public.groups g where g.id = group_id and g.owner_id = auth.uid()));

create policy "owners manage bill items" on public.bill_items
for all to authenticated
using (exists (
  select 1 from public.bills b join public.groups g on g.id = b.group_id
  where b.id = bill_id and g.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.bills b join public.groups g on g.id = b.group_id
  where b.id = bill_id and g.owner_id = auth.uid()
));

create policy "owners manage payments" on public.payments
for all to authenticated
using (exists (
  select 1 from public.bills b join public.groups g on g.id = b.group_id
  where b.id = bill_id and g.owner_id = auth.uid()
))
with check (exists (
  select 1 from public.bills b join public.groups g on g.id = b.group_id
  where b.id = bill_id and g.owner_id = auth.uid()
));

-- Receipt bucket: public read URLs for simple receipt previews; uploads remain authenticated.
-- For sensitive receipts, switch to a private bucket and use signed URLs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', true, 8388608, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

create policy "authenticated upload receipt" on storage.objects
for insert to authenticated
with check (bucket_id = 'receipts');

create policy "authenticated read receipts" on storage.objects
for select to authenticated
using (bucket_id = 'receipts');
