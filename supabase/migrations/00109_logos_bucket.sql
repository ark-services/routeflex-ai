-- Migration 00109: Create the "logos" private storage bucket.
--
-- The RLS policies for this bucket were added in migration 00050, but the
-- bucket itself was never created via a migration (it was created manually
-- in Supabase Studio for production). This migration ensures the bucket
-- exists in all environments (local dev, staging, new deployments).

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  false,
  5242880,  -- 5 MB
  ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
