CREATE OR REPLACE FUNCTION public.set_account_deletion_stage(p_log_id uuid, p_status text, p_last_error_code text DEFAULT NULL::text, p_photos_removed integer DEFAULT NULL::integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current text;
  v_allowed boolean := false;
BEGIN
  IF p_status = 'auth_deleted' THEN
    RAISE EXCEPTION 'Status auth_deleted moze ustawic wylacznie mark_account_deletion_done';
  END IF;
  IF p_status NOT IN ('pending','database_deleted','storage_deleted','failed') THEN
    RAISE EXCEPTION 'Nieznany status etapu';
  END IF;
  IF p_photos_removed IS NOT NULL AND p_photos_removed < 0 THEN
    RAISE EXCEPTION 'photos_removed nie moze byc ujemne';
  END IF;
  IF p_last_error_code IS NOT NULL AND p_last_error_code !~ '^[a-z0-9_]{1,40}$' THEN
    RAISE EXCEPTION 'Niepoprawny kod bledu';
  END IF;

  SELECT status INTO v_current FROM public.account_deletions WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_current = 'auth_deleted' THEN
    RAISE EXCEPTION 'Stan auth_deleted jest koncowy';
  END IF;

  IF p_status = v_current THEN
    v_allowed := true;
  ELSIF v_current = 'pending' AND p_status IN ('database_deleted','failed') THEN
    v_allowed := true;
  ELSIF v_current = 'database_deleted' AND p_status IN ('storage_deleted','failed') THEN
    v_allowed := true;
  ELSIF v_current = 'storage_deleted' AND p_status = 'failed' THEN
    v_allowed := true;
  ELSIF v_current = 'failed' AND p_status IN ('database_deleted','storage_deleted') THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Niedozwolone przejscie statusu: % -> %', v_current, p_status;
  END IF;

  IF p_status = 'storage_deleted' AND EXISTS (
    SELECT 1 FROM public.account_deletion_objects o
    WHERE o.log_id = p_log_id AND o.removed = false
  ) THEN
    RAISE EXCEPTION 'Nie wszystkie pliki zostaly usuniete';
  END IF;

  UPDATE public.account_deletions
  SET status = p_status,
      last_error_code = p_last_error_code,
      photos_removed = coalesce(p_photos_removed, photos_removed)
  WHERE id = p_log_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_account_deletion_stage(uuid, text, text, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_account_deletion_done(p_log_id uuid, p_photos_removed integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_found boolean;
BEGIN
  IF p_photos_removed IS NOT NULL AND p_photos_removed < 0 THEN
    RAISE EXCEPTION 'photos_removed nie moze byc ujemne';
  END IF;

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