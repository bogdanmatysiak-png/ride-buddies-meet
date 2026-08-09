ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS encoded_polyline text,
  ADD COLUMN IF NOT EXISTS cameras integer,
  ADD COLUMN IF NOT EXISTS section_checks integer;