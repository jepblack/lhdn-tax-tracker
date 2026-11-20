-- LHDN Tax Relief & Receipt Manager - Supabase Schema
-- Run this in your Supabase Dashboard -> SQL Editor

-- 1. User Tax Profiles (per Year of Assessment)
create table if not exists public.tax_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null,
  annual_income numeric(12, 2) not null default 84000,
  zakat_paid numeric(12, 2) not null default 0,
  pcb_paid numeric(12, 2) not null default 0,
  status_reliefs jsonb not null default '{"individual": true, "disabledIndividual": false, "spouse": false, "disabledSpouse": false, "childrenUnder18": 0, "childrenHigherEd": 0, "disabledChildren": 0, "disabledChildrenHigherEd": 0}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, tax_year)
);

-- 2. Tax Relief Expenses & Receipts
create table if not exists public.tax_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tax_year integer not null,
  category_id text not null,
  sub_category_id text,
  merchant text not null,
  description text default '',
  amount numeric(12, 2) not null check (amount >= 0),
  expense_date date not null,
  invoice_number text default '',
  receipt_path text,
  receipt_mime_type text,
  receipt_file_name text,
  ai_extracted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tax_expenses_user_year on public.tax_expenses(user_id, tax_year);
create index if not exists idx_tax_expenses_category on public.tax_expenses(category_id);

-- 3. Grant table permissions to authenticated users & Enable Row Level Security (RLS)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.tax_profiles to authenticated;
grant select, insert, update, delete on table public.tax_expenses to authenticated;

alter table public.tax_profiles enable row level security;
alter table public.tax_expenses enable row level security;

create policy "Users manage own tax profiles"
  on public.tax_profiles for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users manage own tax expenses"
  on public.tax_expenses for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 4. Private Storage Bucket for Receipts (7-Year Audit Vault)
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

create policy "Users upload own receipts"
  on storage.objects for insert
  with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users view own receipts"
  on storage.objects for select
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
