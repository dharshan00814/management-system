-- ====================================================================
-- HYNA STUDIO: PAYROLL MANAGEMENT SQL MIGRATION
-- Run this script in your Supabase Dashboard -> SQL Editor
-- ====================================================================

-- 1. CREATE PAYROLL TABLE
CREATE TABLE IF NOT EXISTS public.payroll (
  id TEXT PRIMARY KEY DEFAULT ('pay_' || encode(gen_random_bytes(6), 'hex')),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT NOT NULL,
  base_salary NUMERIC NOT NULL DEFAULT 0,
  bonus NUMERIC NOT NULL DEFAULT 0,
  deductions NUMERIC NOT NULL DEFAULT 0,
  net_salary NUMERIC GENERATED ALWAYS AS (base_salary + bonus - deductions) STORED,
  pay_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status TEXT NOT NULL DEFAULT 'Paid',
  bank_account TEXT DEFAULT '•••• 4892',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. CREATE INDEXES
CREATE INDEX IF NOT EXISTS idx_payroll_user_id ON public.payroll(user_id);
CREATE INDEX IF NOT EXISTS idx_payroll_employee_id ON public.payroll(employee_id);

-- 3. ENABLE RLS
ALTER TABLE public.payroll ENABLE ROW LEVEL SECURITY;

-- 4. RLS POLICIES
-- Rule: Only CEO Vignesh can view all members' payroll.
-- All other members can ONLY view their own payroll record.
DROP POLICY IF EXISTS "payroll_select" ON public.payroll;
CREATE POLICY "payroll_select" ON public.payroll
  FOR SELECT TO authenticated
  USING (
    -- User is accessing their own payroll
    user_id = auth.uid()
    OR employee_id = (SELECT employee_id FROM public.profiles WHERE id = auth.uid() LIMIT 1)
    -- OR user is CEO Vignesh (only CEO sees everyone)
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          UPPER(designation) = 'CEO'
          OR LOWER(name) LIKE '%vignesh%'
          OR LOWER(email) LIKE '%vignesh%'
          OR employee_id = 'EMP-001'
        )
    )
  );

-- Only CEO Vignesh can insert/create payroll records
DROP POLICY IF EXISTS "payroll_insert" ON public.payroll;
CREATE POLICY "payroll_insert" ON public.payroll
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          UPPER(designation) = 'CEO'
          OR LOWER(name) LIKE '%vignesh%'
          OR LOWER(email) LIKE '%vignesh%'
          OR employee_id = 'EMP-001'
        )
    )
  );

-- Only CEO Vignesh can update Base Salary, Bonus, Deductions, or Status
DROP POLICY IF EXISTS "payroll_update" ON public.payroll;
CREATE POLICY "payroll_update" ON public.payroll
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          UPPER(designation) = 'CEO'
          OR LOWER(name) LIKE '%vignesh%'
          OR LOWER(email) LIKE '%vignesh%'
          OR employee_id = 'EMP-001'
        )
    )
  );

-- Only CEO Vignesh can delete payroll records
DROP POLICY IF EXISTS "payroll_delete" ON public.payroll;
CREATE POLICY "payroll_delete" ON public.payroll
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND (
          UPPER(designation) = 'CEO'
          OR LOWER(name) LIKE '%vignesh%'
          OR LOWER(email) LIKE '%vignesh%'
          OR employee_id = 'EMP-001'
        )
    )
  );

-- 5. REALTIME PUBLICATION
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payroll'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.payroll;
  END IF;
END $$;

-- 6. POPULATE / SEED ORIGINAL 13 MEMBERS (NO DEMO MEMBERS)
-- Automatically links user_id if the profile exists in public.profiles
INSERT INTO public.payroll (employee_id, name, role, department, base_salary, bonus, deductions, pay_date, status, bank_account, user_id)
VALUES
  ('EMP-001', 'Vignesh', 'CEO & Founder', 'Executive', 185000, 25000, 18000, CURRENT_DATE, 'Paid', '•••• 4892', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-001' OR LOWER(email) LIKE '%vignesh%' LIMIT 1)),
  ('EMP-002', 'Jashwin', 'Chief Operating Officer', 'Executive', 160000, 18000, 15000, CURRENT_DATE, 'Paid', '•••• 3190', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-002' OR LOWER(email) LIKE '%jashwin%' LIMIT 1)),
  ('EMP-003', 'Dharshan', 'Executive Admin', 'Executive', 140000, 12000, 13000, CURRENT_DATE, 'Paid', '•••• 7183', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-003' OR LOWER(email) LIKE '%dharshan%' LIMIT 1)),
  ('EMP-004', 'Asthamil', 'Engineering Manager', 'Engineering', 135000, 15000, 12000, CURRENT_DATE, 'Paid', '•••• 9024', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-004' OR LOWER(email) LIKE '%asthamil%' LIMIT 1)),
  ('EMP-005', 'Zarif', 'Lead Developer', 'Engineering', 120000, 10000, 11000, CURRENT_DATE, 'Paid', '•••• 1156', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-005' OR LOWER(email) LIKE '%zarif%' LIMIT 1)),
  ('EMP-006', 'Hajira Mufliha', 'UI/UX Designer', 'Design', 105000, 8000, 9500, CURRENT_DATE, 'Paid', '•••• 6421', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-006' OR LOWER(email) LIKE '%hajira%' LIMIT 1)),
  ('EMP-007', 'Linciya', 'Senior QA Engineer', 'Quality Assurance', 95000, 7000, 8500, CURRENT_DATE, 'Paid', '•••• 8820', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-007' OR LOWER(email) LIKE '%linciya%' LIMIT 1)),
  ('EMP-008', 'Arshiya', 'Product Manager', 'Product', 115000, 9000, 10000, CURRENT_DATE, 'Paid', '•••• 5543', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-008' OR LOWER(email) LIKE '%arshiya%' LIMIT 1)),
  ('EMP-009', 'Akshaya', 'Frontend Developer', 'Engineering', 90000, 6000, 8000, CURRENT_DATE, 'Processing', '•••• 7712', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-009' OR LOWER(email) LIKE '%akshaya%' LIMIT 1)),
  ('EMP-010', 'Thivan', 'Backend Developer', 'Engineering', 92000, 6500, 8200, CURRENT_DATE, 'Processing', '•••• 2341', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-010' OR LOWER(email) LIKE '%thivan%' LIMIT 1)),
  ('EMP-011', 'Rohit', 'DevOps Engineer', 'Operations', 98000, 7500, 8800, CURRENT_DATE, 'Processing', '•••• 9918', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-011' OR LOWER(email) LIKE '%rohit%' LIMIT 1)),
  ('EMP-012', 'Tharun Krishna', 'Mobile Developer', 'Engineering', 88000, 6000, 7800, CURRENT_DATE, 'Pending', '•••• 4432', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-012' OR LOWER(email) LIKE '%tharun%' LIMIT 1)),
  ('EMP-013', 'Anzar', 'Marketing Lead', 'Marketing', 85000, 5500, 7500, CURRENT_DATE, 'Pending', '•••• 1289', (SELECT id FROM public.profiles WHERE employee_id = 'EMP-013' OR LOWER(email) LIKE '%anzar%' LIMIT 1))
ON CONFLICT (employee_id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  department = EXCLUDED.department,
  base_salary = EXCLUDED.base_salary,
  bonus = EXCLUDED.bonus,
  deductions = EXCLUDED.deductions,
  status = EXCLUDED.status,
  updated_at = NOW();
