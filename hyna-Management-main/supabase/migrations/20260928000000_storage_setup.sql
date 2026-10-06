-- Migration: Setup Supabase storage bucket 'files' and RLS policies

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'files',
  'files',
  true,
  104857600,
  NULL
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = NULL;

DO $$
BEGIN
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
