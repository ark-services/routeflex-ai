-- ============================================================================
-- MONDAY.COM-STYLE AUTOMATION ENGINE
-- Adds column-specific triggers and expanded action types
-- ============================================================================

-- ============================================================================
-- PART 1: Add new trigger types for column-specific events
-- ============================================================================

insert into public.automation_triggers (key, name, description, payload_schema) values
  -- Column-specific status change trigger (the key one for Monday.com style)
  ('board.status_changes_to', 'Status Column Changes To',
   'When a specific status column changes to a specific value',
   '{"company_id":"uuid","job_id":"uuid","board_id":"uuid","applicant_id":"uuid","column_id":"uuid","column_name":"text","old_value":"uuid","new_value":"uuid","old_label":"text","new_label":"text"}'::jsonb),

  -- Date column change trigger
  ('board.date_arrives', 'Date Arrives',
   'When a date column reaches a specific date',
   '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","column_id":"uuid","column_name":"text","date":"date"}'::jsonb),

  -- Number column change trigger
  ('board.number_changes', 'Number Changes',
   'When a number column value changes',
   '{"company_id":"uuid","job_id":"uuid","applicant_id":"uuid","column_id":"uuid","column_name":"text","old_value":"number","new_value":"number"}'::jsonb)

on conflict (key) do nothing;

-- ============================================================================
-- PART 2: Expand automation_actions.type check constraint for new actions
-- ============================================================================

-- Drop existing constraint
alter table public.automation_actions
  drop constraint if exists automation_actions_type_check;

-- Add expanded constraint with all action types
alter table public.automation_actions
  add constraint automation_actions_type_check
  check (type in (
    -- Existing actions
    'move_group',
    'set_status',
    'webhook',
    'send_email',
    -- New Monday.com-style actions
    'change_status',      -- Change a specific status column to a value
    'delete_item',        -- Delete the applicant row
    'set_date',           -- Set a date column to a specific date/relative value
    'set_number',         -- Set a number column to a specific value
    'inc_dec',            -- Increment or decrement a number column
    'send_slack'          -- Send Slack notification (webhook-based)
  ));

-- ============================================================================
-- PART 3: Add settings column to board_columns if not exists
-- This stores status options and other column metadata for the UI
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'board_columns'
      and column_name = 'settings'
  ) then
    alter table public.board_columns add column settings jsonb not null default '{}'::jsonb;
  end if;
end $$;

-- ============================================================================
-- PART 4: Helper function to get status label text by ID
-- Used in automation UI to display readable sentences
-- ============================================================================

create or replace function public.get_status_label_text(p_label_id uuid)
returns text as $$
declare
  v_label text;
begin
  select label into v_label
  from public.board_status_labels
  where id = p_label_id;

  return v_label;
end;
$$ language plpgsql stable security definer;

-- ============================================================================
-- PART 5: Helper function to get column name by ID
-- Used in automation execution for logging
-- ============================================================================

create or replace function public.get_column_name(p_column_id uuid)
returns text as $$
declare
  v_name text;
begin
  select name into v_name
  from public.board_columns
  where id = p_column_id;

  return v_name;
end;
$$ language plpgsql stable security definer;

-- ============================================================================
-- PART 6: Add composite index for board cell lookups during automation execution
-- ============================================================================

create index if not exists board_cells_applicant_column_idx
  on public.board_cells(applicant_id, column_id);

-- ============================================================================
-- PART 7: Update automation_runs status constraint to include 'queued'
-- (Already in 00025 migration but ensuring it's complete)
-- ============================================================================

-- Constraint already exists in 00025 migration, no action needed

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

do $$
begin
  raise notice '✅ Monday.com-style automation schema update complete';
  raise notice '   - Added column-specific trigger types (board.status_changes_to, etc.)';
  raise notice '   - Expanded action types (change_status, delete_item, set_date, set_number, inc_dec, send_slack)';
  raise notice '   - Added helper functions for label/column lookups';
  raise notice '   - Ready for interactive recipe builder UI';
end $$;
