CREATE TABLE public.camera_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  kind text NOT NULL DEFAULT 'camera',
  address text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT camera_reports_kind_check CHECK (kind IN ('camera','section')),
  CONSTRAINT camera_reports_status_check CHECK (status IN ('pending','approved','rejected')),
  CONSTRAINT camera_reports_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT camera_reports_lng_check CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT camera_reports_description_check CHECK (char_length(description) <= 500)
);

GRANT SELECT ON public.camera_reports TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.camera_reports TO authenticated;
GRANT ALL ON public.camera_reports TO service_role;

ALTER TABLE public.camera_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Zatwierdzone zgloszenia sa publiczne"
  ON public.camera_reports FOR SELECT
  USING (status = 'approved');

CREATE POLICY "Wlasne zgloszenia widoczne"
  ON public.camera_reports FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Zalogowani dodaja zgloszenia"
  ON public.camera_reports FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Autor lub admin edytuje zgloszenie"
  ON public.camera_reports FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Autor lub admin usuwa zgloszenie"
  ON public.camera_reports FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER camera_reports_touch_updated_at
  BEFORE UPDATE ON public.camera_reports
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX camera_reports_status_idx ON public.camera_reports (status);

ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS camera_sources text[] NOT NULL DEFAULT '{}'::text[];