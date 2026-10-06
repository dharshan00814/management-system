-- ============================================================
-- Reset Vignesh's attendance for today
-- ============================================================

-- 1. Ensure authenticated users / Admins can DELETE attendance
ALTER TABLE IF EXISTS public.attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "attendance_delete" ON public.attendance_records;
CREATE POLICY "attendance_delete" ON public.attendance_records
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() 
        AND (profiles.role = 'admin' OR LOWER(profiles.name) LIKE '%vignesh%' OR profiles.designation ILIKE '%CEO%')
    )
  );

-- 2. Delete today's attendance for Vignesh (or EMP-001)
DELETE FROM public.attendance_records
WHERE date = CURRENT_DATE
  AND (
    user_id IN (
      SELECT id FROM public.profiles 
      WHERE LOWER(name) LIKE '%vignesh%' 
         OR LOWER(email) LIKE '%vignesh%' 
         OR employee_id = 'EMP-001'
    )
  );

-- Verify deletion
SELECT * FROM public.attendance_records WHERE date = CURRENT_DATE;
