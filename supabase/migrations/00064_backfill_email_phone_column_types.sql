-- Migration: backfill board_columns.type for email and phone columns.
--
-- Root cause: mapFieldTypeToColumnType previously mapped form field types
-- "email" and "phone" to board column type "text", so all default Email
-- Address and Phone columns for existing jobs were stored as text columns.
-- This caused them to skip E.164 normalization and email validation on save.
--
-- Fix: update only columns that are explicitly linked (via field_id) to a
-- form field whose type is "email" or "phone". This is precise and safe —
-- it never touches user-created columns whose names happen to be "Email".

UPDATE board_columns bc
SET    type = 'email'
FROM   job_application_fields jaf
WHERE  bc.field_id = jaf.id
  AND  jaf.type = 'email'
  AND  bc.type  = 'text';

UPDATE board_columns bc
SET    type = 'phone'
FROM   job_application_fields jaf
WHERE  bc.field_id = jaf.id
  AND  jaf.type = 'phone'
  AND  bc.type  = 'text';
