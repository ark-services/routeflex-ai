-- Add 'location' to the allowed types for job_application_fields
ALTER TABLE public.job_application_fields
  DROP CONSTRAINT IF EXISTS job_application_fields_type_check;

ALTER TABLE public.job_application_fields
  ADD CONSTRAINT job_application_fields_type_check
  CHECK (type IN (
    'text', 'textarea', 'email', 'phone', 'number',
    'date', 'file', 'checkbox', 'radio', 'select', 'location'
  ));
