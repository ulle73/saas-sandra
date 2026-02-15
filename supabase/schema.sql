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
  news_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  published_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (company_id, url)
);

create table if not exists public.weekly_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  company_id uuid references public.companies (id) on delete set null,
  reason text not null,
  pitch text not null,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

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

commit;
