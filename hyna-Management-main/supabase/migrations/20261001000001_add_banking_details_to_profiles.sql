-- Migration: Add Bank Account Number and IFSC Code to Profiles and Members View
-- Description: Enables members and administrators to record and update direct payout/banking details

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS bank_account_number TEXT DEFAULT '';

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS ifsc_code TEXT DEFAULT '';

-- Update the public.members view to expose bank details
DROP VIEW IF EXISTS public.members CASCADE;

CREATE VIEW public.members WITH (security_invoker = false) AS
SELECT 
  id, 
  employee_id, 
  name, 
  email, 
  avatar, 
  role, 
  department, 
  designation, 
  phone, 
  status, 
  active_projects, 
  join_date, 
  last_active, 
  bank_account_number, 
  ifsc_code, 
  created_at, 
  updated_at
FROM public.profiles;

GRANT SELECT ON public.members TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
