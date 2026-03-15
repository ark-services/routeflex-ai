-- Migration: Auto-create a company and account when a new user signs up
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Function runs as SECURITY DEFINER to bypass RLS on companies/company_members
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_account_id uuid;
  new_company_id uuid;
begin
  -- Create a default account (billing entity) for the new user
  insert into public.accounts (name, plan_type, onboarding_completed)
  values (split_part(new.email, '@', 1) || '''s Account', 'basic', false)
  returning id into new_account_id;

  -- Add the user to the account as admin
  insert into public.account_memberships (account_id, user_id, role)
  values (new_account_id, new.id, 'admin');

  -- Create a default company for the new user linked to the account
  insert into public.companies (name, account_id)
  values (split_part(new.email, '@', 1) || '''s Company', new_account_id)
  returning id into new_company_id;

  -- Add the user as owner in company_members (legacy, for backwards compatibility)
  insert into public.company_members (company_id, user_id, role)
  values (new_company_id, new.id, 'owner');

  return new;
end;
$$;

-- Trigger fires after a new auth.users row is inserted
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
