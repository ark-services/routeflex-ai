-- 00084_invite_links.sql
-- Reusable invite links (role-based, not email-specific) for account membership

-- ── Table ─────────────────────────────────────────────────────────────────────
create table public.account_invite_links (
  id          uuid        primary key default gen_random_uuid(),
  account_id  uuid        not null references public.accounts(id) on delete cascade,
  role        text        not null default 'member' check (role in ('admin', 'member', 'viewer')),
  created_by  uuid        not null references auth.users(id),
  token       text        not null unique default encode(extensions.gen_random_bytes(32), 'hex'),
  expires_at  timestamptz not null default (now() + interval '30 days'),
  is_active   boolean     not null default true,
  use_count   int         not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.account_invite_links enable row level security;

-- Account admins can fully manage invite links for their account
create policy "Account admins can manage invite links"
  on public.account_invite_links for all
  using (
    exists (
      select 1 from public.account_memberships
      where account_id = account_invite_links.account_id
        and user_id = auth.uid()
        and role = 'admin'
    )
  );

-- ── RPC: get_invite_link_info ──────────────────────────────────────────────────
-- SECURITY DEFINER so unauthenticated visitors can look up an invite link
create or replace function public.get_invite_link_info(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_link    record;
begin
  select
    l.account_id,
    l.role,
    l.expires_at,
    a.name as account_name
  into v_link
  from public.account_invite_links l
  join public.accounts a on a.id = l.account_id
  where l.token = p_token
    and l.is_active = true
    and l.expires_at > now();

  if not found then
    return jsonb_build_object('error', 'invalid');
  end if;

  return jsonb_build_object(
    'account_id',   v_link.account_id,
    'account_name', v_link.account_name,
    'role',         v_link.role,
    'expires_at',   v_link.expires_at
  );
end;
$$;

-- ── RPC: accept_invite_link ────────────────────────────────────────────────────
-- Validates the token, checks seat limits, adds the current user to the account.
-- Returns: { success: true, account_id }
--        | { already_member: true, account_id }
--        | { error: 'invalid' | 'unauthenticated' | 'seat_limit' }
create or replace function public.accept_invite_link(p_token text)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id       uuid := auth.uid();
  v_link          record;
  v_already       boolean;
  v_seat_count    int;
begin
  if v_user_id is null then
    return jsonb_build_object('error', 'unauthenticated');
  end if;

  -- Find valid link
  select l.*, a.max_seats
  into   v_link
  from   public.account_invite_links l
  join   public.accounts a on a.id = l.account_id
  where  l.token     = p_token
    and  l.is_active = true
    and  l.expires_at > now();

  if not found then
    return jsonb_build_object('error', 'invalid');
  end if;

  -- Already a member?
  select exists(
    select 1 from public.account_memberships
    where account_id = v_link.account_id and user_id = v_user_id
  ) into v_already;

  if v_already then
    return jsonb_build_object('already_member', true, 'account_id', v_link.account_id);
  end if;

  -- Seat limit check
  select count(*) into v_seat_count
  from public.account_memberships
  where account_id = v_link.account_id;

  if v_seat_count >= v_link.max_seats then
    return jsonb_build_object('error', 'seat_limit');
  end if;

  -- Add member
  insert into public.account_memberships (account_id, user_id, role)
  values (v_link.account_id, v_user_id, v_link.role);

  -- Track usage
  update public.account_invite_links
  set use_count = use_count + 1
  where id = v_link.id;

  return jsonb_build_object('success', true, 'account_id', v_link.account_id);
end;
$$;

do $$ begin
  raise notice '✅ Created account_invite_links table + RLS + get_invite_link_info + accept_invite_link RPCs';
end $$;
