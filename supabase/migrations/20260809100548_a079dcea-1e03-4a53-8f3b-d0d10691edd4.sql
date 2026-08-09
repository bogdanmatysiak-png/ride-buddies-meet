ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS start_lat double precision,
  ADD COLUMN IF NOT EXISTS start_lng double precision;

CREATE TABLE public.ride_alerts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  radius_km integer NOT NULL DEFAULT 50,
  label text NOT NULL DEFAULT '',
  notify_new boolean NOT NULL DEFAULT true,
  notify_soon boolean NOT NULL DEFAULT true,
  hours_before integer NOT NULL DEFAULT 24,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_alerts TO authenticated;
GRANT ALL ON public.ride_alerts TO service_role;
ALTER TABLE public.ride_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own ride alerts"
  ON public.ride_alerts FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER ride_alerts_touch_updated_at
  BEFORE UPDATE ON public.ride_alerts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.ride_alert_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('new', 'soon')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, ride_id, kind)
);

GRANT SELECT ON public.ride_alert_deliveries TO authenticated;
GRANT ALL ON public.ride_alert_deliveries TO service_role;
ALTER TABLE public.ride_alert_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own alert deliveries"
  ON public.ride_alert_deliveries FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'ride-alerts-hourly',
  '15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--b4e20236-8294-4664-a20f-3034c8b138f6.lovable.app/api/public/ride-alerts',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable__j9nayeBHijaIcTraWjZtA_So-UPRiK"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);