CREATE TABLE public.ride_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ride_messages_ride_idx ON public.ride_messages (ride_id, created_at);

GRANT SELECT ON public.ride_messages TO anon;
GRANT SELECT, INSERT, DELETE ON public.ride_messages TO authenticated;
GRANT ALL ON public.ride_messages TO service_role;

ALTER TABLE public.ride_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Wiadomosci sa publiczne" ON public.ride_messages
  FOR SELECT USING (true);

CREATE POLICY "Zalogowani moga pisac jako oni sami" ON public.ride_messages
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Autor wiadomosci lub wyprawy moze usunac" ON public.ride_messages
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_id AND r.host_id = auth.uid())
  );

ALTER PUBLICATION supabase_realtime ADD TABLE public.ride_messages;