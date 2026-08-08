CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Czlonkowie grupy widza wiadomosci"
ON public.group_messages FOR SELECT TO authenticated
USING (
  public.is_group_member(group_id, auth.uid())
  OR public.is_group_owner(group_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Czlonkowie grupy pisza wiadomosci"
ON public.group_messages FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (
    public.is_group_member(group_id, auth.uid())
    OR public.is_group_owner(group_id, auth.uid())
  )
);

CREATE POLICY "Autor wlasciciel lub admin usuwa wiadomosc"
ON public.group_messages FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_owner(group_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin')
);

CREATE INDEX group_messages_group_created_idx ON public.group_messages (group_id, created_at);

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;