ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mesh_supported boolean NOT NULL DEFAULT false;
ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS mesh_supported boolean NOT NULL DEFAULT false;