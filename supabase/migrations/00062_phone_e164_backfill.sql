-- Migration: 00062_phone_e164_backfill
-- Normalize existing phone values stored as raw 10-digit strings to E.164.
--
-- Before: "5551234567"   (10 raw digits, stored by old validatePhone)
-- After:  "+15551234567" (E.164, stored by new validatePhone)
--
-- Only touches rows where:
--   1. The board column type is 'phone'
--   2. The stored value_text is exactly 10 ASCII digits (old format)
-- Rows already in E.164 (starting with +) are left untouched.

UPDATE public.board_cells bc
SET    value_text = '+1' || bc.value_text
WHERE  bc.value_text ~ '^\d{10}$'
  AND  EXISTS (
         SELECT 1
         FROM   public.board_columns col
         WHERE  col.id   = bc.column_id
           AND  col.type = 'phone'
       );
