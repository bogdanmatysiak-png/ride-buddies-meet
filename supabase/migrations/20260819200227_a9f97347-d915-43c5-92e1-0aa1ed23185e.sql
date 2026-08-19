-- 1) Rozszerzenie audytu usuwania kont
ALTER TABLE public.account_deletions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_error_code text;

UPDATE public.account_deletions
SET status = CASE WHEN auth_deleted THEN 'auth_deleted' ELSE 'database_deleted' END
WHERE status = 'pending';

ALTER TABLE public.account_deletions DROP CONSTRAINT IF EXISTS account_deletions_status_check;
ALTER TABLE public.account_deletions
  ADD CONSTRAINT account_deletions_status_check
  CHECK (status IN ('pending','database_deleted','storage_deleted','auth_deleted','failed'));

ALTER TABLE public.account_deletions DROP CONSTRAINT IF EXISTS account_deletions_last_error_code_check;
ALTER TABLE public.account_deletions
  ADD CONSTRAINT account_deletions_last_error_code_check
  CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,40}$');

DROP TRIGGER IF EXISTS account_deletions_touch_updated_at ON public.account_deletions;
CREATE TRIGGER account_deletions_touch_updated_at
BEFORE UPDATE ON public.account_deletions
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2) Kolejka plikow do usuniecia (tylko service_role; brak dostepu dla anon/authenticated)
CREATE TABLE IF NOT EXISTS public.account_deletion_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  log_id uuid NOT NULL REFERENCES public.account_deletions(id) ON DELETE CASCADE,
  bucket_id text NOT NULL,
  object_name text NOT NULL,
  removed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (log_id, bucket_id, object_name)
);
GRANT ALL ON public.account_deletion_objects TO service_role;
ALTER TABLE public.account_deletion_objects ENABLE ROW LEVEL SECURITY;

-- 3) delete_my_account: atomowa czesc SQL + wpis audytowy 'database_deleted'
CREATE OR REPLACE FUNCTION public.delete_my_account(
  p_transfers jsonb DEFAULT '[]'::jsonb,
  p_confirm_delete_orphan_groups boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
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

  SELECT coalesce(array_agg(DISTINCT m.image_url), ARRAY[]::text[])
  INTO v_photos
  FROM public.ride_messages m
  WHERE m.image_url IS NOT NULL
    AND (
      m.user_id = v_uid
      OR m.ride_id IN (SELECT r.id FROM public.rides r WHERE r.host_id = v_uid)
    );

  WITH del AS (DELETE FROM public.rides WHERE host_id = v_uid RETURNING 1)
  SELECT count(*) INTO v_rides_deleted FROM del;

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
    (user_id, rides_deleted, groups_transferred, groups_deleted, photos_removed, status)
  VALUES
    (v_uid, v_rides_deleted, v_transferred, v_groups_deleted, 0, 'database_deleted')
  RETURNING id INTO v_log_id;

  INSERT INTO public.account_deletion_objects (log_id, bucket_id, object_name)
  SELECT v_log_id, 'chat-photos', p
  FROM unnest(v_photos) AS p
  WHERE p IS NOT NULL AND p <> ''
  ON CONFLICT DO NOTHING;

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

-- 4) mark_account_deletion_done: finalny stan, tylko service_role
DROP FUNCTION IF EXISTS public.mark_account_deletion_done(uuid, integer);
CREATE OR REPLACE FUNCTION public.mark_account_deletion_done(p_log_id uuid, p_photos_removed integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_found boolean;
BEGIN
  UPDATE public.account_deletions
  SET auth_deleted = true,
      status = 'auth_deleted',
      last_error_code = NULL,
      photos_removed = coalesce(p_photos_removed, photos_removed)
  WHERE id = p_log_id;
  v_found := FOUND;

  UPDATE public.account_deletion_objects
  SET removed = true
  WHERE log_id = p_log_id;

  RETURN v_found;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_account_deletion_done(uuid, integer) TO service_role;

-- 5) Funkcja administracyjna: aktualizacja etapu wylacznie dla wskazanego log_id
CREATE OR REPLACE FUNCTION public.set_account_deletion_stage(
  p_log_id uuid,
  p_status text,
  p_last_error_code text DEFAULT NULL,
  p_photos_removed integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_found boolean;
BEGIN
  IF p_status NOT IN ('pending','database_deleted','storage_deleted','auth_deleted','failed') THEN
    RAISE EXCEPTION 'Nieznany status etapu';
  END IF;
  IF p_last_error_code IS NOT NULL AND p_last_error_code !~ '^[a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'Niepoprawny kod bledu';
  END IF;

  UPDATE public.account_deletions
  SET status = p_status,
      last_error_code = p_last_error_code,
      auth_deleted = (p_status = 'auth_deleted') OR auth_deleted,
      photos_removed = coalesce(p_photos_removed, photos_removed)
  WHERE id = p_log_id;

  v_found := FOUND;

  IF p_status IN ('storage_deleted','auth_deleted') THEN
    UPDATE public.account_deletion_objects SET removed = true WHERE log_id = p_log_id;
  END IF;

  RETURN v_found;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) TO service_role;

-- 6) Odczyt nieukonczonych procesow (tylko service_role) dla mechanizmu dokonczenia
CREATE OR REPLACE FUNCTION public.list_incomplete_account_deletions(p_limit integer DEFAULT 50)
RETURNS TABLE (
  log_id uuid,
  user_id uuid,
  status text,
  last_error_code text,
  created_at timestamptz,
  pending_objects jsonb
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT d.id,
         d.user_id,
         d.status,
         d.last_error_code,
         d.created_at,
         coalesce(
           (SELECT jsonb_agg(jsonb_build_object('bucket_id', o.bucket_id, 'object_name', o.object_name))
            FROM public.account_deletion_objects o
            WHERE o.log_id = d.id AND o.removed = false),
           '[]'::jsonb)
  FROM public.account_deletions d
  WHERE d.status <> 'auth_deleted'
  ORDER BY d.created_at
  LIMIT least(coalesce(p_limit, 50), 200);
$$;

REVOKE ALL ON FUNCTION public.list_incomplete_account_deletions(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_incomplete_account_deletions(integer) FROM anon;
REVOKE ALL ON FUNCTION public.list_incomplete_account_deletions(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.list_incomplete_account_deletions(integer) TO service_role;