-- ============================================================
-- HYNA MANAGEMENT - SUPABASE STORAGE BUCKET CONFIGURATION
-- Run this script in your Supabase SQL Editor:
-- Supabase Dashboard -> SQL Editor -> New Query -> Paste & Run
-- ============================================================

-- 1. Create the 'files' storage bucket if it does not already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'files',
  'files',
  true,                  -- Public bucket so files can be accessed via URL
  104857600,             -- Max file size limit: 100 MB (in bytes)
  NULL                   -- Allow all file types (images, pdfs, docs, zip, code, etc.)
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = NULL;

-- 2. Create RLS Policies for the 'files' bucket
-- (Note: Do NOT run ALTER TABLE on storage.objects; it is managed by Supabase internal admin)

DO $$
BEGIN
  -- Read Policy: Allow anyone (public, authenticated, anon) to read/download files
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Allow public read on files'
  ) THEN
    CREATE POLICY "Allow public read on files"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'files');
  END IF;

  -- Upload Policy: Allow users to upload files into 'files' bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Allow public upload to files'
  ) THEN
    CREATE POLICY "Allow public upload to files"
    ON storage.objects FOR INSERT
    TO public
    WITH CHECK (bucket_id = 'files');
  END IF;

  -- Update Policy: Allow users to update files in 'files' bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Allow public update on files'
  ) THEN
    CREATE POLICY "Allow public update on files"
    ON storage.objects FOR UPDATE
    TO public
    USING (bucket_id = 'files');
  END IF;

  -- Delete Policy: Allow users to delete files from 'files' bucket
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'storage' 
      AND tablename = 'objects' 
      AND policyname = 'Allow public delete on files'
  ) THEN
    CREATE POLICY "Allow public delete on files"
    ON storage.objects FOR DELETE
    TO public
    USING (bucket_id = 'files');
  END IF;
END $$;

-- 3. Ensure database table public.files has appropriate RLS permissions
ALTER TABLE IF EXISTS public.files ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "files_all" ON public.files;
  DROP POLICY IF EXISTS "files_anon_all" ON public.files;
EXCEPTION WHEN others THEN null;
END $$;

CREATE POLICY "files_all"
ON public.files FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "files_anon_all"
ON public.files FOR ALL
TO anon
USING (true)
WITH CHECK (true);

-- Done! Your Supabase storage bucket 'files' is ready.
