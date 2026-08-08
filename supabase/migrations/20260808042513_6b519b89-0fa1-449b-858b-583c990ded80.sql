ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notify_group_invite boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_group_accepted boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.wants_notification(_user_id uuid, _kind text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT CASE _kind
        WHEN 'invite' THEN p.notify_group_invite
        WHEN 'accepted' THEN p.notify_group_accepted
        ELSE true
      END
     FROM public.profiles p WHERE p.id = _user_id),
    true)
$$;

CREATE OR REPLACE FUNCTION public.notify_group_invite()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g_name text;
  inviter text;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF NOT public.wants_notification(NEW.user_id, 'invite') THEN RETURN NEW; END IF;
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
$function$;

CREATE OR REPLACE FUNCTION public.notify_group_invite_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  WHERE t IS NOT NULL AND t <> NEW.user_id AND public.wants_notification(t, 'accepted');
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.notify_group_invite_removed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  g_name text;
  actor uuid := auth.uid();
  who text;
BEGIN
  IF OLD.status <> 'pending' THEN
    RETURN OLD;
  END IF;

  SELECT name INTO g_name FROM public.groups WHERE id = OLD.group_id;
  IF g_name IS NULL THEN
    RETURN OLD;
  END IF;

  IF actor IS NOT NULL AND actor = OLD.user_id THEN
    IF OLD.invited_by IS NOT NULL AND OLD.invited_by <> OLD.user_id
       AND public.wants_notification(OLD.invited_by, 'accepted') THEN
      SELECT nick INTO who FROM public.profiles WHERE id = OLD.user_id;
      INSERT INTO public.notifications (user_id, group_id, title, body)
      VALUES (
        OLD.invited_by,
        OLD.group_id,
        'Zaproszenie odrzucone',
        coalesce(who, 'Motocyklista') || ' odrzucił zaproszenie do grupy ' || g_name || '.'
      );
    END IF;
  ELSIF public.wants_notification(OLD.user_id, 'invite') THEN
    INSERT INTO public.notifications (user_id, group_id, title, body)
    VALUES (
      OLD.user_id,
      OLD.group_id,
      'Zaproszenie anulowane',
      'Zaproszenie do grupy ' || g_name || ' zostało anulowane.'
    );
  END IF;

  RETURN OLD;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.wants_notification(uuid, text) FROM anon, authenticated, public;