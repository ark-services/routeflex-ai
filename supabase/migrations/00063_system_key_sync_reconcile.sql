-- Migration: add system_key to board_columns for stable canonical field matching.
--
-- "Canonical" fields are the default form questions whose field.key is one of
-- the reserved identifiers below.  Storing this key directly on the board
-- column lets the reconcile function re-link (or re-create) columns even when
-- the board_columns row was hard-deleted and the field_id FK is gone.
--
-- Non-canonical, user-created columns keep system_key = NULL.

ALTER TABLE board_columns
  ADD COLUMN IF NOT EXISTS system_key text;

-- Backfill existing columns that are already linked to canonical fields.
UPDATE board_columns bc
SET    system_key = jaf.key
FROM   job_application_fields jaf
WHERE  bc.field_id = jaf.id
  AND  jaf.key IN ('first_name', 'last_name', 'email', 'phone');

-- Index: fast lookup of canonical columns within a board.
CREATE INDEX IF NOT EXISTS idx_board_columns_system_key
  ON board_columns (board_id, system_key)
  WHERE system_key IS NOT NULL;
