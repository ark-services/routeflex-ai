-- Migration: add is_default_for_applications flag to board_groups.
--
-- This column identifies which group new public applicants should land in.
-- It replaces the fragile name-based lookup ("New Applicants") that was
-- failing when users deleted or renamed groups.
--
-- The public form submission now uses this flag as the primary signal,
-- falling back to name matching, then first group, then auto-creation.

ALTER TABLE board_groups
  ADD COLUMN IF NOT EXISTS is_default_for_applications boolean NOT NULL DEFAULT false;

-- Backfill: flag the canonical intake groups for all existing boards.
-- We treat both "New Applicants" (fedex_pd template) and "New Group"
-- (scratch template) as default intake groups.
UPDATE board_groups
SET    is_default_for_applications = true
WHERE  name IN ('New Applicants', 'New Group');

-- Edge-case cleanup: if a board ended up with multiple groups flagged
-- (e.g. it had both "New Applicants" and "New Group"), keep only the
-- one with the lowest sort_order and clear the rest.
UPDATE board_groups g
SET    is_default_for_applications = false
WHERE  is_default_for_applications = true
  AND  sort_order > (
         SELECT MIN(g2.sort_order)
         FROM   board_groups g2
         WHERE  g2.board_id = g.board_id
           AND  g2.is_default_for_applications = true
       );

-- Partial index: makes the flag lookup during public submissions fast.
CREATE INDEX IF NOT EXISTS idx_board_groups_default_app
  ON board_groups (board_id, is_default_for_applications)
  WHERE is_default_for_applications = true;
