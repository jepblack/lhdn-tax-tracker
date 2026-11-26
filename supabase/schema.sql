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

create policy "Users update own receipts"
  on storage.objects for update
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users delete own receipts"
  on storage.objects for delete
  using (
    bucket_id = 'receipts'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- 5. User Subscriptions & AI Quota Tracking (Locked-down RLS + Server Webhook Upgrades)
create table if not exists public.user_subscriptions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_tier text not null default 'free' check (plan_tier in ('free', 'pro', 'family')),
  ai_scans_used integer not null default 0 check (ai_scans_used >= 0),
  ai_scans_limit integer not null default 5 check (ai_scans_limit >= 0),
  gateway text default null,
  payment_ref text default null,
  expires_at timestamptz default null,
  pdpa_consented_at timestamptz default null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Authenticated users can ONLY read their subscription; plan_tier & ai_scans_limit
-- can only be modified by service_role (verified payment webhooks) or safe SECURITY DEFINER RPCs.
revoke insert, update, delete on table public.user_subscriptions from authenticated, anon;
grant select on table public.user_subscriptions to authenticated;

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users view and manage own subscription" on public.user_subscriptions;
create policy "Users view own subscription"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

-- Safe RPC allowing an authenticated user (or server acting with their JWT) to increment ONLY ai_scans_used
create or replace function public.increment_own_ai_scan()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.user_subscriptions (user_id, plan_tier, ai_scans_used, ai_scans_limit, updated_at)
  values (auth.uid(), 'free', 1, 5, now())
  on conflict (user_id)
  do update set
    ai_scans_used = public.user_subscriptions.ai_scans_used + 1,
    updated_at = now();
end;
$$;

grant execute on function public.increment_own_ai_scan() to authenticated;

-- Safe RPC to record PDPA explicit consent timestamp without exposing plan_tier writes
create or replace function public.record_pdpa_consent()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  insert into public.user_subscriptions (user_id, plan_tier, ai_scans_used, ai_scans_limit, pdpa_consented_at, updated_at)
  values (auth.uid(), 'free', 0, 5, now(), now())
  on conflict (user_id)
  do update set
    pdpa_consented_at = coalesce(public.user_subscriptions.pdpa_consented_at, now()),
    updated_at = now();
end;
$$;

grant execute on function public.record_pdpa_consent() to authenticated;
