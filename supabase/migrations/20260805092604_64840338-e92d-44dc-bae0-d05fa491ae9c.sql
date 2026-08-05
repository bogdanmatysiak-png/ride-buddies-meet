ALTER TABLE public.rides
  ADD COLUMN intercom boolean NOT NULL DEFAULT false,
  ADD COLUMN intercom_type text NOT NULL DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN intercom boolean NOT NULL DEFAULT false,
  ADD COLUMN intercom_type text NOT NULL DEFAULT '';