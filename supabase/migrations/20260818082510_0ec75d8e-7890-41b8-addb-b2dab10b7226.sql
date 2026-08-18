ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS duration_minutes integer;