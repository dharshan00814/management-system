-- ============================================================
-- Migration: Add points column to attendance_records
-- ============================================================

ALTER TABLE IF EXISTS public.attendance_records
  ADD COLUMN IF NOT EXISTS points INTEGER DEFAULT 0;

-- Refresh view to include points
CREATE OR REPLACE VIEW public.attendance AS
  SELECT * FROM public.attendance_records;

-- Index for fast user attendance lookup by date
CREATE INDEX IF NOT EXISTS idx_attendance_records_user_date ON public.attendance_records (user_id, date DESC);
