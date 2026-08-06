ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pref_curvy boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_avoid_highways boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_avoid_tolls boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pref_avoid_ferries boolean NOT NULL DEFAULT true;