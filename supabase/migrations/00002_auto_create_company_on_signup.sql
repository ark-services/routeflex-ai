-- Migration: Auto-create a company when a new user signs up
-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- Function runs as SECURITY DEFINER to bypass RLS on companies/company_members
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_company_id uuid;
begin
  -- Create a default company for the new user
  insert into public.companies (name)
  values (split_part(new.email, '@', 1) || '''s Company')
  returning id into new_company_id;

  -- Add the user as owner
  insert into public.company_members (company_id, user_id, role)
  values (new_company_id, new.id, 'owner');

  return new;
end;
$$;

-- Trigger fires after a new auth.users row is inserted
create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function public.handle_new_user();
