CREATE TABLE IF NOT EXISTS public.account_deletions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  rides_deleted integer NOT NULL DEFAULT 0,
  groups_transferred integer NOT NULL DEFAULT 0,
  groups_deleted integer NOT NULL DEFAULT 0,
  photos_removed integer NOT NULL DEFAULT 0,
  auth_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.account_deletions TO service_role;
ALTER TABLE public.account_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin czyta log usuniec kont" ON public.account_deletions;
CREATE POLICY "Admin czyta log usuniec kont"
ON public.account_deletions
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.delete_my_account(
  p_transfers jsonb DEFAULT '[]'::jsonb,
  p_confirm_delete_orphan_groups boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_group record;
  v_target uuid;
  v_has_mod boolean;
  v_transferred integer := 0;
  v_groups_deleted integer := 0;
  v_rides_deleted integer := 0;
  v_photos text[] := ARRAY[]::text[];
  v_log_id uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Musisz byc zalogowany, zeby usunac konto';
  END IF;

  -- 1) Grupy, ktorych jestem wlascicielem: transfer albo usuniecie
  FOR v_group IN SELECT id, name FROM public.groups WHERE owner_id = v_uid LOOP
    SELECT EXISTS (
      SELECT 1 FROM public.group_members m
      WHERE m.group_id = v_group.id
        AND m.user_id <> v_uid
        AND m.status = 'accepted'
        AND m.role = 'moderator'
    ) INTO v_has_mod;

    SELECT (t->>'new_owner_user_id')::uuid INTO v_target
    FROM jsonb_array_elements(coalesce(p_transfers, '[]'::jsonb)) AS t
    WHERE (t->>'group_id')::uuid = v_group.id
    LIMIT 1;

    IF v_has_mod THEN
      IF v_target IS NULL THEN
        RAISE EXCEPTION 'Wybierz nowego wlasciciela dla grupy %', v_group.name;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.group_members m
        WHERE m.group_id = v_group.id
          AND m.user_id = v_target
          AND m.status = 'accepted'
          AND m.role = 'moderator'
      ) THEN
        RAISE EXCEPTION 'Wybrana osoba nie jest moderatorem grupy %', v_group.name;
      END IF;

      UPDATE public.group_members
      SET role = 'owner'
      WHERE group_id = v_group.id AND user_id = v_target;

      UPDATE public.groups SET owner_id = v_target WHERE id = v_group.id;

      DELETE FROM public.group_members
      WHERE group_id = v_group.id AND user_id = v_uid;

      v_transferred := v_transferred + 1;
    ELSE
      IF NOT p_confirm_delete_orphan_groups THEN
        RAISE EXCEPTION 'Potwierdz usuniecie grup bez moderatora';
      END IF;
      DELETE FROM public.groups WHERE id = v_group.id;
      v_groups_deleted := v_groups_deleted + 1;
    END IF;
  END LOOP;

  -- 2) Zdjecia czatu: moje oraz nalezace do moich wypraw (usuwanych razem z kontem)
  SELECT coalesce(array_agg(DISTINCT m.image_url), ARRAY[]::text[])
  INTO v_photos
  FROM public.ride_messages m
  WHERE m.image_url IS NOT NULL
    AND (
      m.user_id = v_uid
      OR m.ride_id IN (SELECT r.id FROM public.rides r WHERE r.host_id = v_uid)
    );

  -- 3) Moje wyprawy (kaskada: uczestnicy, wiadomosci, oceny, powiadomienia, dostawy alertow)
  WITH del AS (DELETE FROM public.rides WHERE host_id = v_uid RETURNING 1)
  SELECT count(*) INTO v_rides_deleted FROM del;

  -- 4) Pozostale dane nalezace wylacznie do mnie
  DELETE FROM public.ride_messages WHERE user_id = v_uid;
  DELETE FROM public.group_messages WHERE user_id = v_uid;
  DELETE FROM public.ride_ratings WHERE user_id = v_uid;
  DELETE FROM public.ride_participants WHERE user_id = v_uid;
  DELETE FROM public.ride_alert_deliveries WHERE user_id = v_uid;
  DELETE FROM public.ride_alerts WHERE user_id = v_uid;
  DELETE FROM public.camera_reports WHERE user_id = v_uid;
  DELETE FROM public.notifications WHERE user_id = v_uid;
  DELETE FROM public.group_members WHERE user_id = v_uid;
  DELETE FROM public.user_roles WHERE user_id = v_uid;
  DELETE FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.account_deletions
    (user_id, rides_deleted, groups_transferred, groups_deleted, photos_removed)
  VALUES
    (v_uid, v_rides_deleted, v_transferred, v_groups_deleted, coalesce(array_length(v_photos, 1), 0))
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'log_id', v_log_id,
    'photos', to_jsonb(v_photos),
    'rides_deleted', v_rides_deleted,
    'groups_transferred', v_transferred,
    'groups_deleted', v_groups_deleted
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account(jsonb, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_my_account(jsonb, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_my_account(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account(jsonb, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_account_deletion_done(p_log_id uuid, p_photos_removed integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE public.account_deletions
  SET auth_deleted = true, photos_removed = coalesce(p_photos_removed, photos_removed)
  WHERE id = p_log_id;
$$;

REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_account_deletion_done(uuid, integer) TO service_role;