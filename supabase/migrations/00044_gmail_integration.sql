-- Migration: Gmail Integration Support
-- Adds email column type, email_gmail action type, and metadata to integration_credentials

-- ============================================================================
-- PART 1: Add 'email' type to board_columns
-- ============================================================================

-- Drop existing constraint
alter table public.board_columns
  drop constraint if exists board_columns_type_check;

-- Add constraint with email type
alter table public.board_columns
  add constraint board_columns_type_check
  check (type in ('text', 'number', 'date', 'file', 'status', 'email'));

-- ============================================================================
-- PART 2: Add metadata column to integration_credentials
-- Stores additional data like the connected email address for display
-- ============================================================================

alter table public.integration_credentials
  add column if not exists metadata jsonb not null default '{}';

-- ============================================================================
-- PART 3: Add 'email_gmail' to automation_actions type constraint
-- ============================================================================

-- Drop existing constraint
alter table public.automation_actions
  drop constraint if exists automation_actions_type_check;

-- Add constraint with email_gmail and send_email_gmail types
alter table public.automation_actions
  add constraint automation_actions_type_check
  check (type in (
    -- Existing actions
    'move_group',
    'set_status',
    'webhook',
    'send_email',
    'change_status',
    'delete_item',
    'set_date',
    'set_number',
    'inc_dec',
    'send_slack',
    -- Gmail actions
    'email_gmail',
    'send_email_gmail'
  ));
