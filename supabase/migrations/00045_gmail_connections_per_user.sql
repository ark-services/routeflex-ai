-- Migration: Per-user Gmail connections
-- Creates table for storing user-level Gmail OAuth credentials

-- ============================================================================
-- PART 1: Create gmail_connections table
-- ============================================================================

create table public.gmail_connections (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_address text not null,
  provider text not null default 'google',
  access_token text not null,  -- encrypted by application
  refresh_token text,          -- encrypted by application, nullable
  token_expiry timestamptz,    -- when access_token expires
  scope text not null,         -- OAuth scopes granted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,      -- when user disconnected

  -- Ensure one connection per (account, user, email) triple
  unique(account_id, user_id, email_address)
);

-- Indexes for common queries
create index gmail_connections_account_id_idx on public.gmail_connections(account_id);
create index gmail_connections_user_id_idx on public.gmail_connections(user_id);
create index gmail_connections_account_user_idx on public.gmail_connections(account_id, user_id) where revoked_at is null;

-- ============================================================================
-- PART 2: Row Level Security
-- ============================================================================

alter table public.gmail_connections enable row level security;

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
-- PART 3: Add email column type if not exists
-- ============================================================================

do $$
begin
  -- Check if email type already exists in constraint
  if not exists (
    select 1 from pg_constraint
    where conname = 'board_columns_type_check'
    and conbin::text like '%email%'
  ) then
    -- Add email type
    alter table public.board_columns
      drop constraint if exists board_columns_type_check;

    alter table public.board_columns
      add constraint board_columns_type_check
      check (type in ('text', 'number', 'date', 'file', 'status', 'email'));
  end if;
end$$;
