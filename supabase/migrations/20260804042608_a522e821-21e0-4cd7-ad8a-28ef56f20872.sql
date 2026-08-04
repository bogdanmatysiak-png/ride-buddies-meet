CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Wlasne role widoczne" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Admin widzi wszystkie role" ON public.user_roles
FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin zarzadza rolami" ON public.user_roles
FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE public.ride_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL CHECK (score BETWEEN 1 AND 5),
  comment text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, user_id)
);

GRANT SELECT ON public.ride_ratings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_ratings TO authenticated;
GRANT ALL ON public.ride_ratings TO service_role;
ALTER TABLE public.ride_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Oceny sa publiczne" ON public.ride_ratings
FOR SELECT USING (true);

CREATE POLICY "Mozna dodac wlasna ocene" ON public.ride_ratings
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Mozna edytowac wlasna ocene" ON public.ride_ratings
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Autor lub admin moze usunac ocene" ON public.ride_ratings
FOR DELETE TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER ride_ratings_touch_updated_at
BEFORE UPDATE ON public.ride_ratings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "Admin moze edytowac kazda wyprawe" ON public.rides
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin moze usunac kazda wyprawe" ON public.rides
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin moze usunac kazda wiadomosc" ON public.ride_messages
FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));