-- Migration: Job Application Form Engine
-- Creates dynamic form schema tables and links boards to jobs
-- Fixes duplication issues with proper unique constraints

-- ============================================================================
-- PART 1: Add job_id to boards table (make boards job-specific)
-- ============================================================================

do $$
begin
  if not exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'boards'
      and column_name = 'job_id'
  ) then
    alter table public.boards add column job_id uuid references public.jobs(id) on delete cascade;
    create index boards_job_id_idx on public.boards(job_id);
    create unique index boards_company_job_name_idx on public.boards(company_id, job_id, name)
      where job_id is not null;
  end if;
end $$;


-- Before adding unique indexes, clean up any existing duplicates that would prevent index creation.
-- Keep the earliest row per (board_id, name) and delete the rest.
-- NOTE: Some earlier migrations may have created board_groups/board_columns with a different board FK column name.
-- This block detects the correct column and applies the dedupe + unique index safely.

do $$
declare
  bg_board_col text;
  bc_board_col text;
begin
  -- Detect the board foreign-key column name for board_groups
  select c.column_name into bg_board_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'board_groups'
    and c.column_name in ('board_id', 'board_uuid', 'board')
  order by case c.column_name when 'board_id' then 1 when 'board_uuid' then 2 when 'board' then 3 else 99 end
  limit 1;

  if bg_board_col is not null then
    -- Deduplicate board_groups (same board + name)
    execute format($SQL$
      delete from public.board_groups bg
      using (
        select id
        from (
          select
            id,
            row_number() over (
              partition by %I, name
              order by coalesce(created_at, now()) asc, id asc
            ) as rn
          from public.board_groups
        ) t
        where t.rn > 1
      ) d
      where bg.id = d.id
    $SQL$, bg_board_col);

    -- Unique constraint on board_groups: (board_fk, name)
    execute format(
      'create unique index if not exists board_groups_board_name_idx on public.board_groups(%I, name);',
      bg_board_col
    );
  else
    raise notice 'Skipping board_groups dedupe/index: no board_id-like column found on public.board_groups';
  end if;

  -- Detect the board foreign-key column name for board_columns
  select c.column_name into bc_board_col
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'board_columns'
    and c.column_name in ('board_id', 'board_uuid', 'board')
  order by case c.column_name when 'board_id' then 1 when 'board_uuid' then 2 when 'board' then 3 else 99 end
  limit 1;

  if bc_board_col is not null then
    -- Deduplicate board_columns (same board + name)
    execute format($SQL$
      delete from public.board_columns bc
      using (
        select id
        from (
          select
            id,
            row_number() over (
              partition by %I, name
              order by coalesce(created_at, now()) asc, id asc
            ) as rn
          from public.board_columns
        ) t
        where t.rn > 1
      ) d
      where bc.id = d.id
    $SQL$, bc_board_col);

    -- Unique constraint on board_columns: (board_fk, name)
    execute format(
      'create unique index if not exists board_columns_board_name_idx on public.board_columns(%I, name);',
      bc_board_col
    );
  else
    raise notice 'Skipping board_columns dedupe/index: no board_id-like column found on public.board_columns';
  end if;
end $$;

-- ============================================================================
-- PART 3: Create job_application_forms table
-- ============================================================================

create table if not exists public.job_application_forms (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  -- Public submission token (UUID, randomly generated)
  public_token uuid not null default gen_random_uuid(),
  -- Form metadata
  title text not null default 'Application Form',
  description text,
  -- Settings (jsonb for future extensibility)
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One form per job
  unique(job_id)
);

create index job_application_forms_job_id_idx on public.job_application_forms(job_id);
create index job_application_forms_company_id_idx on public.job_application_forms(company_id);
create unique index job_application_forms_public_token_idx on public.job_application_forms(public_token);

-- Enable RLS
alter table public.job_application_forms enable row level security;

-- Members can view their company's forms
drop policy if exists "Members can view company forms" on public.job_application_forms;
create policy "Members can view company forms"
  on public.job_application_forms
  for select
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
    )
  );

-- Admins can manage forms
drop policy if exists "Admins can manage forms" on public.job_application_forms;
create policy "Admins can manage forms"
  on public.job_application_forms
  for all
  using (
    company_id in (
      select company_id
      from public.company_members
      where user_id = auth.uid()
        and role in ('owner', 'admin')
    )
  );

-- ============================================================================
-- PART 4: Create job_application_fields table
-- ============================================================================

create table if not exists public.job_application_fields (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.job_application_forms(id) on delete cascade,
  -- Field properties
  key text not null, -- machine-readable key (e.g., "first_name", "email")
  label text not null, -- user-facing label (e.g., "First Name", "Email Address")
  type text not null check (type in (
    'text', 'textarea', 'email', 'phone', 'number',
    'date', 'file', 'checkbox', 'radio', 'select'
  )),
  -- Field configuration
  required boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true, -- soft delete for historical data preservation
  -- Field-specific settings (validation, options, etc.)
  settings jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Unique key per form
  unique(form_id, key)
);

create index job_application_fields_form_id_idx on public.job_application_fields(form_id);
create index job_application_fields_sort_order_idx on public.job_application_fields(form_id, sort_order);
create index job_application_fields_active_idx on public.job_application_fields(form_id, is_active);

-- Enable RLS
alter table public.job_application_fields enable row level security;

-- Members can view fields for their company's forms
drop policy if exists "Members can view form fields" on public.job_application_fields;
create policy "Members can view form fields"
  on public.job_application_fields
  for select
  using (
    form_id in (
      select id
      from public.job_application_forms
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
      )
    )
  );

-- Admins can manage form fields
drop policy if exists "Admins can manage form fields" on public.job_application_fields;
create policy "Admins can manage form fields"
  on public.job_application_fields
  for all
  using (
    form_id in (
      select id
      from public.job_application_forms
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
          and role in ('owner', 'admin')
      )
    )
  );

-- ============================================================================
-- PART 5: Create applicant_field_values table (EAV model)
-- ============================================================================

create table if not exists public.applicant_field_values (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  field_id uuid not null references public.job_application_fields(id) on delete restrict,
  -- Multiple typed value columns for different data types
  value_text text,
  value_number numeric,
  value_bool boolean,
  value_date date,
  value_json jsonb,
  value_file_path text, -- Supabase Storage path for file uploads
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One value per applicant per field
  unique(applicant_id, field_id)
);

create index applicant_field_values_applicant_id_idx on public.applicant_field_values(applicant_id);
create index applicant_field_values_field_id_idx on public.applicant_field_values(field_id);

-- Enable RLS
alter table public.applicant_field_values enable row level security;

-- Anyone can insert values during public application submission
drop policy if exists "Anyone can submit field values" on public.applicant_field_values;
create policy "Anyone can submit field values"
  on public.applicant_field_values
  for insert
  with check (true);

-- Members can view field values for their company's applicants
drop policy if exists "Members can view field values" on public.applicant_field_values;
create policy "Members can view field values"
  on public.applicant_field_values
  for select
  using (
    applicant_id in (
      select id
      from public.applicants
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
      )
    )
  );

-- Admins can manage field values
drop policy if exists "Admins can manage field values" on public.applicant_field_values;
create policy "Admins can manage field values"
  on public.applicant_field_values
  for all
  using (
    applicant_id in (
      select id
      from public.applicants
      where company_id in (
        select company_id
        from public.company_members
        where user_id = auth.uid()
          and role in ('owner', 'admin')
      )
    )
  );

-- ============================================================================
-- PART 6: Link board_columns to form fields
-- ============================================================================

do $$
begin
  if not exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_columns'
      and column_name = 'field_id'
  ) then
    alter table public.board_columns
      add column field_id uuid references public.job_application_fields(id) on delete set null;
    create index board_columns_field_id_idx on public.board_columns(field_id);
  end if;
end $$;

-- ============================================================================
-- PART 7: Helper function for public form lookup by token
-- ============================================================================

-- Function to validate public token and get form details (bypasses RLS)
create or replace function public.get_public_form_by_token(token uuid)
returns table (
  form_id uuid,
  job_id uuid,
  company_id uuid,
  title text,
  description text,
  job_title text,
  company_name text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    f.id as form_id,
    f.job_id,
    f.company_id,
    f.title,
    f.description,
    j.title as job_title,
    c.name as company_name
  from public.job_application_forms f
  inner join public.jobs j on j.id = f.job_id
  inner join public.companies c on c.id = f.company_id
  where f.public_token = token
    and j.status = 'open';
end;
$$;

-- Function to get public form fields by token (bypasses RLS)
create or replace function public.get_public_form_fields_by_token(token uuid)
returns table (
  field_id uuid,
  key text,
  label text,
  type text,
  required boolean,
  sort_order int,
  settings jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    f.id as field_id,
    f.key,
    f.label,
    f.type,
    f.required,
    f.sort_order,
    f.settings
  from public.job_application_fields f
  inner join public.job_application_forms jaf on jaf.id = f.form_id
  where jaf.public_token = token
    and f.is_active = true
  order by f.sort_order;
end;
$$;

-- Grant execute permissions to authenticated and anonymous users
grant execute on function public.get_public_form_by_token(uuid) to authenticated, anon;
grant execute on function public.get_public_form_fields_by_token(uuid) to authenticated, anon;

-- ============================================================================
-- PART 8: Update applicants table to support board_id
-- ============================================================================

do $$
begin
  if not exists (
    select from information_schema.columns
    where table_schema = 'public'
      and table_name = 'applicants'
      and column_name = 'board_id'
  ) then
    alter table public.applicants add column board_id uuid references public.boards(id) on delete set null;
    create index applicants_board_id_idx on public.applicants(board_id);
  end if;
end $$;

-- ============================================================================
-- PART 9: Default field templates (for job creation)
-- ============================================================================

-- Create a helper function to generate default form fields for a job
create or replace function public.create_default_form_fields(p_form_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
end;
$$;

grant execute on function public.create_default_form_fields(uuid) to authenticated;

-- ============================================================================
-- PART 10: Cleanup and validation
-- ============================================================================

-- Comment on tables for documentation
comment on table public.job_application_forms is 'Application forms for jobs - defines what fields applicants must fill out';
comment on table public.job_application_fields is 'Fields in application forms - these become board columns';
comment on table public.applicant_field_values is 'EAV model for applicant responses - preserves data even when fields are removed';
