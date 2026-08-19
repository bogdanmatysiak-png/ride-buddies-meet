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
  IF OLD.status = 'accepted' OR NEW.status <> 'accepted' THEN
    RETURN NEW;
  END IF;

  SELECT name, owner_id
  INTO g_name, g_owner
  FROM public.groups
  WHERE id = NEW.group_id;

  SELECT nick
  INTO joiner
  FROM public.profiles
  WHERE id = NEW.user_id;

  INSERT INTO public.notifications (user_id, group_id, title, body)
  SELECT DISTINCT
    t,
    NEW.group_id,
    coalesce(joiner, 'Motocyklista') || ' dolaczyl do grupy ' || coalesce(g_name, ''),
    'Zaproszenie do grupy ' || coalesce(g_name, '') || ' zostalo zaakceptowane.'
  FROM (VALUES (g_owner), (NEW.invited_by)) AS v(t)
  WHERE t IS NOT NULL
    AND t <> NEW.user_id
    AND public.wants_notification(t, 'accepted');

  RETURN NEW;
END;
$function$;
