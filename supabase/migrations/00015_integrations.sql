create table public.integration_credentials (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  integration_type text not null check (integration_type in ('gmail', 'twilio', 'slack')),
  credentials jsonb not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(account_id, integration_type)
);

create index integration_credentials_account_id_idx on public.integration_credentials(account_id);

alter table public.integration_credentials enable row level security;

create policy "Admins can manage integrations" on public.integration_credentials for all
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid() and role = 'admin'));
