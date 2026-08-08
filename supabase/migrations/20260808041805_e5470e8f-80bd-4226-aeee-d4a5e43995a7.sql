-- 1. Role w grupie
DO $$ BEGIN
  CREATE TYPE public.group_role AS ENUM ('owner', 'moderator', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.group_members
  ADD COLUMN IF NOT EXISTS role public.group_role NOT NULL DEFAULT 'member';

UPDATE public.group_members m
SET role = 'owner'
FROM public.groups g
WHERE g.id = m.group_id AND g.owner_id = m.user_id AND m.role <> 'owner';

-- 2. Powiadomienia mogą dotyczyć grupy
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS group_id uuid REFERENCES public.groups(id) ON DELETE CASCADE;

-- 3. Właściciel grupy może zmieniać role / skład
DROP POLICY IF EXISTS "Wlasciciel zarzadza rolami w grupie" ON public.group_members;
CREATE POLICY "Wlasciciel zarzadza rolami w grupie"
ON public.group_members FOR UPDATE TO authenticated
USING (public.is_group_owner(group_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.is_group_owner(group_id, auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- 4. Zwykły członek nie może podnieść sobie roli
CREATE OR REPLACE FUNCTION public.guard_group_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role
     AND NOT public.is_group_owner(NEW.group_id, auth.uid())
     AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Tylko wlasciciel grupy moze zmieniac role';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_members_guard_role ON public.group_members;
CREATE TRIGGER group_members_guard_role
BEFORE UPDATE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.guard_group_member_role();

-- 5. Powiadomienie o zaproszeniu do grupy
CREATE OR REPLACE FUNCTION public.notify_group_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g_name text;
  inviter text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  SELECT name INTO g_name FROM public.groups WHERE id = NEW.group_id;
  SELECT nick INTO inviter FROM public.profiles WHERE id = NEW.invited_by;
  INSERT INTO public.notifications (user_id, group_id, title, body)
  VALUES (
    NEW.user_id,
    NEW.group_id,
    'Zaproszenie do grupy ' || coalesce(g_name, 'motocyklowej'),
    coalesce(inviter, 'Motocyklista') || ' zaprasza Cie do grupy ' || coalesce(g_name, '') || '. Zaakceptuj zaproszenie, zeby jezdzic razem.'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_members_notify_invite ON public.group_members;
CREATE TRIGGER group_members_notify_invite
AFTER INSERT ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.notify_group_invite();

-- 6. Powiadomienie o akceptacji zaproszenia
CREATE OR REPLACE FUNCTION public.notify_group_invite_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g_name text;
  g_owner uuid;
  joiner text;
BEGIN
  IF OLD.status = 'accepted' OR NEW.status <> 'accepted' THEN RETURN NEW; END IF;
  SELECT name, owner_id INTO g_name, g_owner FROM public.groups WHERE id = NEW.group_id;
  SELECT nick INTO joiner FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, group_id, title, body)
  SELECT DISTINCT t, 
    coalesce(joiner, 'Motocyklista') || ' dolaczyl do grupy ' || coalesce(g_name, ''),
    'Zaproszenie do grupy ' || coalesce(g_name, '') || ' zostalo zaakceptowane.'
  FROM (VALUES (g_owner), (NEW.invited_by)) AS v(t)
  WHERE t IS NOT NULL AND t <> NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS group_members_notify_accepted ON public.group_members;
CREATE TRIGGER group_members_notify_accepted
AFTER UPDATE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.notify_group_invite_accepted();

REVOKE EXECUTE ON FUNCTION public.guard_group_member_role() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_group_invite() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_group_invite_accepted() FROM anon, authenticated;