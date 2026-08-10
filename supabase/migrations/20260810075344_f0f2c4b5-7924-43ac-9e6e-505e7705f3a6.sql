ALTER TABLE public.ride_messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.ride_messages ALTER COLUMN body SET DEFAULT '';