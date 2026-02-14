-- Add account_id to companies
alter table public.companies add column account_id uuid references public.accounts(id) on delete cascade;
create index companies_account_id_idx on public.companies(account_id);

-- Backfill: Create one account per existing company
do $$
declare
  company_record record;
  new_account_id uuid;
  owner_user_id uuid;
begin
  for company_record in select id, name, created_at from public.companies where account_id is null loop
    -- Find owner/admin/first member
    select user_id into owner_user_id from public.company_members
    where company_id = company_record.id
    order by case role when 'owner' then 1 when 'admin' then 2 else 3 end, created_at asc limit 1;

    -- Create account
    insert into public.accounts (name, plan_type, max_seats, billing_anchor_day, created_at)
    values (company_record.name, 'basic', 1, extract(day from company_record.created_at)::int, company_record.created_at)
    returning id into new_account_id;

    -- Link company to account
    update public.companies set account_id = new_account_id where id = company_record.id;

    -- Migrate company_members to account_memberships
    insert into public.account_memberships (account_id, user_id, role, created_at)
    select new_account_id, cm.user_id,
      case when cm.role = 'owner' then 'admin' when cm.role = 'admin' then 'admin' else 'member' end,
      cm.created_at
    from public.company_members cm where cm.company_id = company_record.id
    on conflict (account_id, user_id) do nothing;
  end loop;
end $$;

-- Make account_id required
alter table public.companies alter column account_id set not null;

-- Update RLS policies to be account-aware
drop policy if exists "Users can view their companies" on public.companies;
create policy "Users can view companies in their accounts" on public.companies for select
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid()));

drop policy if exists "Users can manage their companies" on public.companies;
create policy "Members can manage companies in their accounts" on public.companies for all
  using (account_id in (select account_id from public.account_memberships where user_id = auth.uid() and role in ('admin', 'member')));
