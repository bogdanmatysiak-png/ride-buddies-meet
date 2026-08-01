CREATE TYPE public.ride_level AS ENUM ('chill', 'sport', 'adventure');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nick text NOT NULL,
  bike text,
  city text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profile są publiczne" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Własny profil - dodawanie" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Własny profil - edycja" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE TABLE public.rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  host_name text NOT NULL,
  title text NOT NULL,
  start_point text NOT NULL,
  end_point text NOT NULL,
  ride_date date NOT NULL,
  ride_time text NOT NULL,
  km integer NOT NULL DEFAULT 0,
  level public.ride_level NOT NULL DEFAULT 'chill',
  spots integer NOT NULL DEFAULT 10,
  description text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.rides TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rides TO authenticated;
GRANT ALL ON public.rides TO service_role;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Wyprawy są publiczne" ON public.rides FOR SELECT USING (true);
CREATE POLICY "Zalogowani mogą ogłaszać wyprawy" ON public.rides FOR INSERT TO authenticated WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Autor może edytować wyprawę" ON public.rides FOR UPDATE TO authenticated USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Autor może usunąć wyprawę" ON public.rides FOR DELETE TO authenticated USING (auth.uid() = host_id);

CREATE TABLE public.ride_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, user_id)
);
GRANT SELECT ON public.ride_participants TO anon;
GRANT SELECT, INSERT, DELETE ON public.ride_participants TO authenticated;
GRANT ALL ON public.ride_participants TO service_role;
ALTER TABLE public.ride_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Uczestnicy są publiczni" ON public.ride_participants FOR SELECT USING (true);
CREATE POLICY "Można zapisać tylko siebie" ON public.ride_participants FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Można wypisać tylko siebie" ON public.ride_participants FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER profiles_touch_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.rides (host_name, title, start_point, end_point, ride_date, ride_time, km, level, spots, description) VALUES
('Marek „Kruk”', 'Beskidzkie serpentyny', 'Kraków', 'Przełęcz Salmopolska', '2026-08-08', '07:30', 240, 'sport', 12, 'Wczesny start, tankowanie w Wadowicach, potem same zakręty. Tempo żywe, ale nikogo nie gubimy — zbiórka po każdym odcinku.'),
('Ania', 'Mazury na miękko', 'Olsztyn', 'Mikołajki', '2026-08-15', '10:00', 160, 'chill', 20, 'Luźna trasa dla każdego, dużo postojów na kawę i zdjęcia nad wodą. Idealne na pierwszą wspólną wyprawę.'),
('Tomek', 'Bieszczady: szuter i mgła', 'Sanok', 'Wetlina', '2026-08-22', '06:45', 310, 'adventure', 8, 'Mieszanka asfaltu i szutrów, opony dual-sport obowiązkowe. Nocleg w bazie, powrót w niedzielę.'),
('Kasia', 'Wybrzeże o świcie', 'Gdańsk', 'Łeba', '2026-09-05', '05:30', 200, 'chill', 15, 'Wyjazd przed wschodem słońca, śniadanie na plaży, powrót lasami. Kaski otwarte, tempo turystyczne.');