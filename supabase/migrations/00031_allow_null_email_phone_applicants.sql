-- ============================================================================
-- Allow null email/phone for draft/placeholder applicants
-- ============================================================================

-- Make email and phone nullable to support "Add item" placeholder creation
alter table public.applicants
  alter column email drop not null,
  alter column phone drop not null;

-- Add a check constraint: if email is provided, it should be valid
-- This maintains data quality while allowing nulls for drafts
alter table public.applicants
  add constraint applicants_email_format_check
  check (email is null or email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$');

comment on column public.applicants.email is 'Email address (nullable for draft applicants created via quick add)';
comment on column public.applicants.phone is 'Phone number (nullable for draft applicants created via quick add)';
