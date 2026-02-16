-- ============================================================================
-- Fix template-based form field seeding
-- ============================================================================
-- This migration fixes the issue where "Start From Scratch" jobs were
-- incorrectly seeded with FedEx P&D-specific form fields.
--
-- Changes:
-- 1. Drop old create_default_form_fields function
-- 2. Create new version that accepts a template parameter
-- 3. Conditionally create fields based on template type

-- Drop the old function
drop function if exists public.create_default_form_fields(uuid);

-- Create new function that accepts template parameter
create or replace function public.create_default_form_fields(
  p_form_id uuid,
  p_template text default 'fedex_pd'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- For "scratch" template: only create basic contact fields
  if p_template = 'scratch' then
    insert into public.job_application_fields (form_id, key, label, type, required, sort_order, settings)
    values
      (p_form_id, 'first_name', 'First Name', 'text', true, 1, '{}'),
      (p_form_id, 'last_name', 'Last Name', 'text', true, 2, '{}'),
      (p_form_id, 'email', 'Email Address', 'email', true, 3, '{}'),
      (p_form_id, 'phone', 'Phone', 'phone', true, 4, '{}')
    on conflict (form_id, key) do nothing;

  -- For "fedex_pd" template: create full FedEx field set
  else
    insert into public.job_application_fields (form_id, key, label, type, required, sort_order, settings)
    values
      -- Contact Information
      (p_form_id, 'first_name', 'First Name', 'text', true, 1, '{}'),
      (p_form_id, 'last_name', 'Last Name', 'text', true, 2, '{}'),
      (p_form_id, 'email', 'Email Address', 'email', true, 3, '{}'),
      (p_form_id, 'phone', 'Phone Number', 'phone', true, 4, '{}'),
      (p_form_id, 'address', 'Home Address', 'textarea', true, 5, '{}'),

      -- Resume
      (p_form_id, 'resume', 'Resume/CV', 'file', true, 6, '{"accept": ".pdf,.doc,.docx", "maxSize": 5242880}'),

      -- Screening Questions (FedEx Ground specific)
      (p_form_id, 'authorized_to_work', 'Are you authorized to work in the United States?', 'radio', true, 7,
        '{"options": ["Yes", "No"]}'),
      (p_form_id, 'active_employee', 'Are you currently an active FedEx Ground employee?', 'radio', true, 8,
        '{"options": ["Yes", "No"]}'),
      (p_form_id, 'drivers_license_years', 'How many years have you had your driver''s license?', 'number', true, 9,
        '{"min": 0, "max": 100}'),
      (p_form_id, 'terminal_preference', 'Terminal Preference', 'text', false, 10, '{}'),
      (p_form_id, 'experience', 'Relevant Experience', 'textarea', false, 11, '{"rows": 4}')
    on conflict (form_id, key) do nothing;
  end if;
end;
$$;

-- Grant execute permission
grant execute on function public.create_default_form_fields(uuid, text) to authenticated;

-- Add comment for documentation
comment on function public.create_default_form_fields(uuid, text) is
  'Creates default form fields based on template type. Templates: scratch (4 basic fields), fedex_pd (11 fields with screening questions)';
