-- Migration: Gmail connections table (idempotent)
-- Creates public.gmail_connections table if it doesn't exist
-- Safe to run multiple times (idempotent)

-- ============================================================================
-- PART 1: Create gmail_connections table
-- ============================================================================

create table if not exists public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null,
  user_id uuid not null,
  email_address text not null,
  provider text not null default 'google',
  access_token text not null,  -- encrypted by application
  refresh_token text,          -- encrypted by application, nullable
  token_expiry timestamptz,    -- when access_token expires
  scope text not null,         -- OAuth scopes granted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz       -- when user disconnected
);

-- Add foreign keys if they don't exist
do $$
begin
  -- Foreign key to accounts
  if not exists (
    select 1 from pg_constraint
    where conname = 'gmail_connections_account_id_fkey'
  ) then
    alter table public.gmail_connections
      add constraint gmail_connections_account_id_fkey
      foreign key (account_id)
      references public.accounts(id)
      on delete cascade;
  end if;

  -- Foreign key to users
  if not exists (
    select 1 from pg_constraint
    where conname = 'gmail_connections_user_id_fkey'
  ) then
    alter table public.gmail_connections
      add constraint gmail_connections_user_id_fkey
      foreign key (user_id)
      references auth.users(id)
      on delete cascade;
  end if;

  -- Unique constraint on (account_id, user_id, email_address)
  if not exists (
    select 1 from pg_constraint
    where conname = 'gmail_connections_account_id_user_id_email_address_key'
  ) then
    alter table public.gmail_connections
      add constraint gmail_connections_account_id_user_id_email_address_key
      unique (account_id, user_id, email_address);
  end if;
end$$;

-- ============================================================================
-- PART 2: Create indexes if they don't exist
-- ============================================================================

-- Index on account_id
create index if not exists gmail_connections_account_id_idx
  on public.gmail_connections(account_id);

-- Index on user_id
create index if not exists gmail_connections_user_id_idx
  on public.gmail_connections(user_id);

-- Composite index on (account_id, user_id) for active connections
create index if not exists gmail_connections_account_user_idx
  on public.gmail_connections(account_id, user_id)
  where revoked_at is null;

-- ============================================================================
-- PART 3: Row Level Security
-- ============================================================================

-- Enable RLS
alter table public.gmail_connections enable row level security;

-- Drop existing policies if they exist (to ensure clean state)
drop policy if exists "Users can view own gmail connections" on public.gmail_connections;
drop policy if exists "Users can create own gmail connections" on public.gmail_connections;
drop policy if exists "Users can update own gmail connections" on public.gmail_connections;
drop policy if exists "Users can delete own gmail connections" on public.gmail_connections;

-- Users can only see their own connections within their account
create policy "Users can view own gmail connections"
  on public.gmail_connections
  for select
  using (
    user_id = auth.uid()
    and account_id in (
      select account_id
      from public.account_memberships
      where user_id = auth.uid()
    )
  );

-- Users can insert their own connections
create policy "Users can create own gmail connections"
  on public.gmail_connections
  for insert
  with check (
    user_id = auth.uid()
    and account_id in (
      select account_id
      from public.account_memberships
      where user_id = auth.uid()
    )
  );

-- Users can update their own connections
create policy "Users can update own gmail connections"
  on public.gmail_connections
  for update
  using (
    user_id = auth.uid()
    and account_id in (
      select account_id
      from public.account_memberships
      where user_id = auth.uid()
    )
  );

-- Users can delete their own connections
create policy "Users can delete own gmail connections"
  on public.gmail_connections
  for delete
  using (
    user_id = auth.uid()
    and account_id in (
      select account_id
      from public.account_memberships
      where user_id = auth.uid()
    )
  );

-- ============================================================================
-- PART 4: Add helpful comment
-- ============================================================================

comment on table public.gmail_connections is
  'Per-user Gmail OAuth connections. Each user can connect their Gmail account to send emails on behalf of the company account.';

comment on column public.gmail_connections.access_token is
  'Encrypted OAuth access token (AES-256-GCM)';

comment on column public.gmail_connections.refresh_token is
  'Encrypted OAuth refresh token (AES-256-GCM)';

comment on column public.gmail_connections.revoked_at is
  'Timestamp when user disconnected their Gmail. NULL means connection is active.';
