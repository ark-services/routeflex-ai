-- Migration: Ensure companies.slug exists + is unique + backfilled

-- 1) Add slug column if missing
alter table public.companies
add column if not exists slug text;

-- 2) Backfill slug for existing rows where missing/empty
update public.companies
set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null or slug = '';

-- 3) If there are duplicates, make them unique by appending a short suffix
-- (only touches duplicates; keeps existing unique slugs as-is)
with ranked as (
  select
    id,
    slug,
    row_number() over (partition by slug order by created_at asc, id asc) as rn
  from public.companies
  where slug is not null and slug <> ''
)
update public.companies c
set slug = c.slug || '-' || substr(c.id::text, 1, 6)
from ranked r
where c.id = r.id
  and r.rn > 1;

-- 4) Unique index (safe name, only created if missing)
create unique index if not exists companies_slug_unique
  on public.companies(slug);

-- Optional: ensure slug is not empty
-- (keeps null allowed if you ever want to reserve slugs later; remove "is null" if you want strict)
alter table public.companies
drop constraint if exists companies_slug_not_empty;

alter table public.companies
add constraint companies_slug_not_empty
check (slug is null or length(slug) > 0);
