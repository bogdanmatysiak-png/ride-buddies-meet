-- 1) mark_account_deletion_done: wylacznie stan koncowy, bez masowego oznaczania kolejki plikow
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
  WHERE id = p_log_id
    AND status IN ('storage_deleted', 'auth_deleted');
  v_found := FOUND;
  RETURN v_found;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM anon;
REVOKE ALL ON FUNCTION public.mark_account_deletion_done(uuid, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_account_deletion_done(uuid, integer) TO service_role;

-- 2) set_account_deletion_stage: kontrolowane przejscia, bez dotykania kolejki plikow
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
DECLARE
  v_current text;
  v_allowed boolean := false;
BEGIN
  IF p_status NOT IN ('pending','database_deleted','storage_deleted','auth_deleted','failed') THEN
    RAISE EXCEPTION 'Nieznany status etapu';
  END IF;
  IF p_last_error_code IS NOT NULL AND p_last_error_code !~ '^[a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'Niepoprawny kod bledu';
  END IF;

  SELECT status INTO v_current FROM public.account_deletions WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- auth_deleted jest stanem koncowym
  IF v_current = 'auth_deleted' THEN
    IF p_status = 'auth_deleted' THEN
      RETURN true;
    END IF;
    RAISE EXCEPTION 'Stan auth_deleted jest koncowy';
  END IF;

  IF p_status = v_current THEN
    v_allowed := true;
  ELSIF v_current = 'pending' AND p_status IN ('database_deleted','failed') THEN
    v_allowed := true;
  ELSIF v_current = 'database_deleted' AND p_status IN ('storage_deleted','failed') THEN
    v_allowed := true;
  ELSIF v_current = 'storage_deleted' AND p_status IN ('auth_deleted','failed') THEN
    v_allowed := true;
  ELSIF v_current = 'failed' AND p_status IN ('database_deleted','storage_deleted') THEN
    -- kontrolowane wznowienie (funkcja dostepna wylacznie dla service_role)
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Niedozwolone przejscie statusu: % -> %', v_current, p_status;
  END IF;

  -- storage_deleted tylko gdy kolejka plikow jest faktycznie pusta
  IF p_status = 'storage_deleted' AND EXISTS (
    SELECT 1 FROM public.account_deletion_objects o
    WHERE o.log_id = p_log_id AND o.removed = false
  ) THEN
    RAISE EXCEPTION 'Nie wszystkie pliki zostaly usuniete';
  END IF;

  UPDATE public.account_deletions
  SET status = p_status,
      last_error_code = p_last_error_code,
      auth_deleted = (p_status = 'auth_deleted') OR auth_deleted,
      photos_removed = coalesce(p_photos_removed, photos_removed)
  WHERE id = p_log_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) TO service_role;

-- 3) Precyzyjne oznaczanie usunietych obiektow Storage
CREATE OR REPLACE FUNCTION public.mark_account_deletion_objects_removed(
  p_log_id uuid,
  p_bucket_id text,
  p_object_names text[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_count integer := 0;
BEGIN
  IF p_log_id IS NULL OR p_bucket_id IS NULL OR p_object_names IS NULL THEN
    RETURN 0;
  END IF;

  WITH upd AS (
    UPDATE public.account_deletion_objects
    SET removed = true
    WHERE log_id = p_log_id
      AND bucket_id = p_bucket_id
      AND object_name = ANY (p_object_names)
      AND removed = false
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM upd;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_account_deletion_objects_removed(uuid, text, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_account_deletion_objects_removed(uuid, text, text[]) FROM anon;
REVOKE ALL ON FUNCTION public.mark_account_deletion_objects_removed(uuid, text, text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_account_deletion_objects_removed(uuid, text, text[]) TO service_role;

-- 4) Licznik obiektow oczekujacych na usuniecie
CREATE OR REPLACE FUNCTION public.count_pending_account_deletion_objects(p_log_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT count(*)::integer
  FROM public.account_deletion_objects o
  WHERE o.log_id = p_log_id AND o.removed = false;
$$;

REVOKE ALL ON FUNCTION public.count_pending_account_deletion_objects(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.count_pending_account_deletion_objects(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.count_pending_account_deletion_objects(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.count_pending_account_deletion_objects(uuid) TO service_role;