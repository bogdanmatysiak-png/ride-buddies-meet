CREATE TYPE public.group_member_status AS ENUM ('pending', 'accepted');

CREATE TABLE public.groups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.groups TO authenticated;
GRANT ALL ON public.groups TO service_role;

CREATE TABLE public.group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.group_member_status NOT NULL DEFAULT 'pending',
  invited_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_members TO authenticated;
GRANT ALL ON public.group_members TO service_role;

CREATE OR REPLACE FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.groups g WHERE g.id = _group_id AND g.owner_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.is_group_member(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members m
    WHERE m.group_id = _group_id AND m.user_id = _user_id AND m.status = 'accepted'
  )
$$;

CREATE OR REPLACE FUNCTION public.has_group_link(_group_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.group_members m WHERE m.group_id = _group_id AND m.user_id = _user_id
  )
$$;

ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Grupy widzi wlasciciel czlonek i zaproszony" ON public.groups
FOR SELECT TO authenticated
USING (owner_id = auth.uid() OR public.has_group_link(id, auth.uid()) OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Zalogowani tworza grupy" ON public.groups
FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Wlasciciel lub admin edytuje grupe" ON public.groups
FOR UPDATE TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Wlasciciel lub admin usuwa grupe" ON public.groups
FOR DELETE TO authenticated
USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role));

ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Czlonkostwa widzi grupa" ON public.group_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_owner(group_id, auth.uid())
  OR public.is_group_member(group_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE POLICY "Wlasciciel zaprasza do grupy" ON public.group_members
FOR INSERT TO authenticated
WITH CHECK (public.is_group_owner(group_id, auth.uid()) AND invited_by = auth.uid());

CREATE POLICY "Zaproszony akceptuje wlasne zaproszenie" ON public.group_members
FOR UPDATE TO authenticated
USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "Czlonek lub wlasciciel usuwa czlonkostwo" ON public.group_members
FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_group_owner(group_id, auth.uid())
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

CREATE TRIGGER groups_touch_updated_at BEFORE UPDATE ON public.groups
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TRIGGER group_members_touch_updated_at BEFORE UPDATE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.rides ADD COLUMN group_id uuid REFERENCES public.groups(id) ON DELETE SET NULL;