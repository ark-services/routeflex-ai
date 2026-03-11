-- Ensure billing_accounts exists and has RLS enabled.
--
-- The table was originally created ad-hoc in the Supabase dashboard (intended
-- for a future Stripe integration) and was never tracked in migrations.
-- CREATE TABLE IF NOT EXISTS is a no-op on any environment where it already
-- exists (e.g. production); on a fresh reset it creates the table so the
-- subsequent ALTER TABLE succeeds everywhere.

create table if not exists public.billing_accounts (
  id                  uuid        primary key default gen_random_uuid(),
  account_id          uuid        not null references public.accounts(id) on delete cascade,
  stripe_customer_id  text        unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table public.billing_accounts enable row level security;
