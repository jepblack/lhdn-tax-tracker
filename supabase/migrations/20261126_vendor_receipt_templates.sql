-- Public/shared PDPA-safe vendor receipt & bill layout templates
-- Stores ONLY structural label anchors (never PII, amounts, dates, or invoice numbers)
create table if not exists public.vendor_receipt_templates (
  vendor_key text primary key,
  vendor_name text not null,
  vendor_keywords text[] not null default '{}',
  amount_anchor text not null,
  date_anchor text not null default '',
  invoice_anchor text not null default '',
  sst_anchor text not null default '',
  category_id text not null,
  sub_category_id text,
  exclude_sst boolean not null default false,
  hit_count integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vendor_receipt_templates enable row level security;

-- Anyone can read shared structural templates; writes happen server-side via service role
drop policy if exists "Public read vendor_receipt_templates" on public.vendor_receipt_templates;
create policy "Public read vendor_receipt_templates"
  on public.vendor_receipt_templates
  for select
  using (true);
