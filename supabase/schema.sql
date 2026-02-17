-- Losen SaaS schema bootstrap for Supabase Postgres
-- Run in Supabase SQL editor, or with: npm run db:init

begin;

create extension if not exists "pgcrypto";

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  industry text,
  website text,
  news_keyword_ids text[] not null default '{}',
  news_custom_keywords text[] not null default '{}',
  news_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.companies
  add column if not exists news_keyword_ids text[] not null default '{}';

alter table public.companies
  add column if not exists news_custom_keywords text[] not null default '{}';

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete set null,
  name text not null,
  email text,
  phone text,
  linkedin_url text,
  last_touchpoint timestamptz,
  next_activity timestamptz,
  status text not null default 'red' check (status in ('green', 'yellow', 'red')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,
  type text not null,
  notes text,
  timestamp timestamptz not null default now(),
  outcome text,
  created_at timestamptz not null default now()
);

create table if not exists public.news_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  url text not null,
  source text,
  news_type text,
  is_relevant boolean not null default true,
  matched_keyword text,
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (company_id, url)
);

alter table public.news_items
  add column if not exists is_relevant boolean not null default true;

alter table public.news_items
  add column if not exists matched_keyword text;

create table if not exists public.weekly_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  prospect_company text,
  prospect_person text,
  prospect_email text,
  source_title text,
  source_url text,
  source_published_at timestamptz,
  source_signal text,
  score integer,
  is_new_prospect boolean not null default false,
  reason text not null,
  pitch text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.lead_discovery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  company_name text not null,
  company_domain text,
  employee_count_estimate integer,
  growth_signal text,
  recommended_person_title text,
  reason text not null,
  pitch text not null,
  score integer not null default 50 check (score >= 1 and score <= 100),
  source_title text not null,
  source_url text not null,
  source_published_at timestamptz,
  linkedin_company_id text,
  linkedin_company_url text,
  contact_candidates jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'accepted', 'rejected', 'converted')),
  reviewed_at timestamptz,
  converted_company_id uuid references public.companies (id) on delete set null,
  converted_contact_id uuid references public.contacts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, company_name, source_url)
);

alter table public.lead_discovery_items
  add column if not exists company_domain text;

alter table public.lead_discovery_items
  add column if not exists employee_count_estimate integer;

alter table public.lead_discovery_items
  add column if not exists growth_signal text;

alter table public.lead_discovery_items
  add column if not exists recommended_person_title text;

alter table public.lead_discovery_items
  add column if not exists reviewed_at timestamptz;

alter table public.lead_discovery_items
  add column if not exists converted_company_id uuid references public.companies (id) on delete set null;

alter table public.lead_discovery_items
  add column if not exists converted_contact_id uuid references public.contacts (id) on delete set null;

alter table public.lead_discovery_items
  add column if not exists contact_candidates jsonb not null default '[]'::jsonb;

alter table public.lead_discovery_items
  add column if not exists linkedin_company_id text;

alter table public.lead_discovery_items
  add column if not exists linkedin_company_url text;

alter table public.weekly_leads
  add column if not exists prospect_company text;

alter table public.weekly_leads
  add column if not exists prospect_person text;

alter table public.weekly_leads
  add column if not exists prospect_email text;

alter table public.weekly_leads
  add column if not exists source_title text;

alter table public.weekly_leads
  add column if not exists source_url text;

alter table public.weekly_leads
  add column if not exists source_published_at timestamptz;

alter table public.weekly_leads
  add column if not exists source_signal text;

alter table public.weekly_leads
  add column if not exists score integer;

alter table public.weekly_leads
  add column if not exists is_new_prospect boolean not null default false;

create index if not exists idx_companies_user_id on public.companies (user_id);
create index if not exists idx_contacts_user_id on public.contacts (user_id);
create index if not exists idx_contacts_company_id on public.contacts (company_id);
create index if not exists idx_contacts_status on public.contacts (status);
create index if not exists idx_activities_user_id on public.activities (user_id);
create index if not exists idx_activities_contact_id on public.activities (contact_id);
create index if not exists idx_news_items_user_id on public.news_items (user_id);
create index if not exists idx_news_items_company_id on public.news_items (company_id);
create index if not exists idx_news_items_published_at on public.news_items (published_at desc);
create index if not exists idx_weekly_leads_user_id on public.weekly_leads (user_id);
create index if not exists idx_weekly_leads_generated_at on public.weekly_leads (generated_at desc);
create index if not exists idx_weekly_leads_new_prospect on public.weekly_leads (is_new_prospect);
create index if not exists idx_weekly_leads_source_url on public.weekly_leads (source_url);
create index if not exists idx_lead_discovery_user_id on public.lead_discovery_items (user_id);
create index if not exists idx_lead_discovery_status on public.lead_discovery_items (status);
create index if not exists idx_lead_discovery_score on public.lead_discovery_items (score desc);
create index if not exists idx_lead_discovery_created_at on public.lead_discovery_items (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_companies_updated_at on public.companies;
create trigger trg_companies_updated_at
before update on public.companies
for each row
execute function public.set_updated_at();

drop trigger if exists trg_contacts_updated_at on public.contacts;
create trigger trg_contacts_updated_at
before update on public.contacts
for each row
execute function public.set_updated_at();

drop trigger if exists trg_lead_discovery_updated_at on public.lead_discovery_items;
create trigger trg_lead_discovery_updated_at
before update on public.lead_discovery_items
for each row
execute function public.set_updated_at();

create or replace function public.compute_contact_status(
  _last_touchpoint timestamptz,
  _next_activity timestamptz
)
returns text
language sql
stable
as $$
  select
    case
      when _next_activity is not null and _next_activity > now() then 'green'
      when _last_touchpoint is not null and _last_touchpoint >= now() - interval '28 days' then 'yellow'
      else 'red'
    end;
$$;

create or replace function public.set_contact_status()
returns trigger
language plpgsql
as $$
begin
  new.status := public.compute_contact_status(new.last_touchpoint, new.next_activity);
  return new;
end;
$$;

drop trigger if exists trg_set_contact_status on public.contacts;
create trigger trg_set_contact_status
before insert or update of last_touchpoint, next_activity on public.contacts
for each row
execute function public.set_contact_status();

create or replace function public.ensure_contact_company_ownership()
returns trigger
language plpgsql
as $$
declare
  _company_user_id uuid;
begin
  if new.company_id is null then
    return new;
  end if;

  select c.user_id into _company_user_id
  from public.companies c
  where c.id = new.company_id;

  if _company_user_id is null then
    raise exception 'Company % does not exist', new.company_id;
  end if;

  if _company_user_id <> new.user_id then
    raise exception 'Company % does not belong to user %', new.company_id, new.user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_contact_company_ownership on public.contacts;
create trigger trg_contact_company_ownership
before insert or update of company_id, user_id on public.contacts
for each row
execute function public.ensure_contact_company_ownership();

create or replace function public.set_activity_user_id()
returns trigger
language plpgsql
as $$
declare
  _contact_user_id uuid;
begin
  select c.user_id into _contact_user_id
  from public.contacts c
  where c.id = new.contact_id;

  if _contact_user_id is null then
    raise exception 'Contact % does not exist', new.contact_id;
  end if;

  if new.user_id is null then
    new.user_id := _contact_user_id;
  elsif new.user_id <> _contact_user_id then
    raise exception 'Activity user_id must match contact owner';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_activity_user_id on public.activities;
create trigger trg_activity_user_id
before insert or update of contact_id, user_id on public.activities
for each row
execute function public.set_activity_user_id();

alter table public.companies enable row level security;
alter table public.contacts enable row level security;
alter table public.activities enable row level security;
alter table public.news_items enable row level security;
alter table public.weekly_leads enable row level security;
alter table public.lead_discovery_items enable row level security;

drop policy if exists companies_select_own on public.companies;
drop policy if exists companies_insert_own on public.companies;
drop policy if exists companies_update_own on public.companies;
drop policy if exists companies_delete_own on public.companies;

create policy companies_select_own on public.companies
for select using (auth.uid() = user_id);
create policy companies_insert_own on public.companies
for insert with check (auth.uid() = user_id);
create policy companies_update_own on public.companies
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy companies_delete_own on public.companies
for delete using (auth.uid() = user_id);

drop policy if exists contacts_select_own on public.contacts;
drop policy if exists contacts_insert_own on public.contacts;
drop policy if exists contacts_update_own on public.contacts;
drop policy if exists contacts_delete_own on public.contacts;

create policy contacts_select_own on public.contacts
for select using (auth.uid() = user_id);
create policy contacts_insert_own on public.contacts
for insert with check (auth.uid() = user_id);
create policy contacts_update_own on public.contacts
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy contacts_delete_own on public.contacts
for delete using (auth.uid() = user_id);

drop policy if exists activities_select_own on public.activities;
drop policy if exists activities_insert_own on public.activities;
drop policy if exists activities_update_own on public.activities;
drop policy if exists activities_delete_own on public.activities;

create policy activities_select_own on public.activities
for select using (auth.uid() = user_id);
create policy activities_insert_own on public.activities
for insert with check (auth.uid() = user_id);
create policy activities_update_own on public.activities
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy activities_delete_own on public.activities
for delete using (auth.uid() = user_id);

drop policy if exists news_items_select_own on public.news_items;
drop policy if exists news_items_insert_own on public.news_items;
drop policy if exists news_items_update_own on public.news_items;
drop policy if exists news_items_delete_own on public.news_items;

create policy news_items_select_own on public.news_items
for select using (auth.uid() = user_id);
create policy news_items_insert_own on public.news_items
for insert with check (auth.uid() = user_id);
create policy news_items_update_own on public.news_items
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy news_items_delete_own on public.news_items
for delete using (auth.uid() = user_id);

drop policy if exists weekly_leads_select_own on public.weekly_leads;
drop policy if exists weekly_leads_insert_own on public.weekly_leads;
drop policy if exists weekly_leads_update_own on public.weekly_leads;
drop policy if exists weekly_leads_delete_own on public.weekly_leads;

create policy weekly_leads_select_own on public.weekly_leads
for select using (auth.uid() = user_id);
create policy weekly_leads_insert_own on public.weekly_leads
for insert with check (auth.uid() = user_id);
create policy weekly_leads_update_own on public.weekly_leads
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy weekly_leads_delete_own on public.weekly_leads
for delete using (auth.uid() = user_id);

drop policy if exists lead_discovery_select_own on public.lead_discovery_items;
drop policy if exists lead_discovery_insert_own on public.lead_discovery_items;
drop policy if exists lead_discovery_update_own on public.lead_discovery_items;
drop policy if exists lead_discovery_delete_own on public.lead_discovery_items;

create policy lead_discovery_select_own on public.lead_discovery_items
for select using (auth.uid() = user_id);
create policy lead_discovery_insert_own on public.lead_discovery_items
for insert with check (auth.uid() = user_id);
create policy lead_discovery_update_own on public.lead_discovery_items
for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy lead_discovery_delete_own on public.lead_discovery_items
for delete using (auth.uid() = user_id);

commit;
