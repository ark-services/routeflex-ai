-- Create accounts table (billing entity)
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan_type text not null default 'basic' check (plan_type in ('basic', 'pro', 'enterprise')),
  max_seats int not null default 1,
  billing_anchor_day int not null default extract(day from now())::int check (billing_anchor_day between 1 and 28),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index accounts_plan_type_idx on public.accounts(plan_type);
create index accounts_created_at_idx on public.accounts(created_at);

-- Create account_memberships (replaces company_members pattern)
create table public.account_memberships (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  created_at timestamptz not null default now(),
  unique (account_id, user_id)
);

create index account_memberships_user_id_idx on public.account_memberships(user_id);
create index account_memberships_account_id_idx on public.account_memberships(account_id);

-- Create account_invites
create table public.account_invites (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'member', 'viewer')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (account_id, email) where accepted_at is null
);

-- Enable RLS
alter table public.accounts enable row level security;
alter table public.account_memberships enable row level security;
alter table public.account_invites enable row level security;

-- RLS Policies
create policy "Users can view their accounts"
  on public.accounts for select
  using (id in (select account_id from public.account_memberships where user_id = auth.uid()));

create policy "Users can view account memberships"
  on public.account_memberships for select
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid()));

create policy "Admins can manage memberships"
  on public.account_memberships for all
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid() and role = 'admin'));

-- Helper functions
create or replace function public.get_billing_period(p_account_id uuid, p_at_date timestamptz default now())
returns table(period_start timestamptz, period_end timestamptz) as $$
declare
  v_anchor_day int;
  v_created_at timestamptz;
  v_start timestamptz;
  v_end timestamptz;
begin
  select billing_anchor_day, created_at into v_anchor_day, v_created_at
  from public.accounts where id = p_account_id;

  v_start := date_trunc('month', p_at_date) + ((v_anchor_day - 1) || ' days')::interval;
  if p_at_date < v_start then
    v_start := date_trunc('month', p_at_date - interval '1 month') + ((v_anchor_day - 1) || ' days')::interval;
  end if;

  v_end := v_start + interval '1 month';
  if v_start < v_created_at then v_start := v_created_at; end if;

  return query select v_start, v_end;
end;
$$ language plpgsql stable;
