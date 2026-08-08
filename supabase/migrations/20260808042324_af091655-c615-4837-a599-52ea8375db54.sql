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
    -- zaproszony odrzucił zaproszenie -> powiadom nadawcę
    IF OLD.invited_by IS NOT NULL AND OLD.invited_by <> OLD.user_id THEN
      SELECT nick INTO who FROM public.profiles WHERE id = OLD.user_id;
      INSERT INTO public.notifications (user_id, group_id, title, body)
      VALUES (
        OLD.invited_by,
        OLD.group_id,
        'Zaproszenie odrzucone',
        coalesce(who, 'Motocyklista') || ' odrzucił zaproszenie do grupy ' || g_name || '.'
      );
    END IF;
  ELSE
    -- nadawca / właściciel anulował zaproszenie -> powiadom zaproszonego
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

DROP TRIGGER IF EXISTS group_members_notify_invite_removed ON public.group_members;
CREATE TRIGGER group_members_notify_invite_removed
AFTER DELETE ON public.group_members
FOR EACH ROW EXECUTE FUNCTION public.notify_group_invite_removed();