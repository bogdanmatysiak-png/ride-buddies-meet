-- Tymczasowa funkcja serwisowa: zapisuje token CRON w Vault bez ujawniania wartosci w SQL/migracji.
CREATE OR REPLACE FUNCTION public.__store_cron_secret_v2(p_value text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, vault
AS $$
DECLARE v_id uuid;
BEGIN
  IF p_value IS NULL OR length(btrim(p_value)) < 16 THEN
    RAISE EXCEPTION 'Token CRON_SECRET_V2 jest pusty lub zbyt krotki';
  END IF;

  SELECT id INTO v_id FROM vault.secrets WHERE name = 'CRON_SECRET_V2';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(p_value, 'CRON_SECRET_V2', 'Token Bearer dla /api/public/ride-alerts');
  ELSE
    PERFORM vault.update_secret(v_id, p_value, 'CRON_SECRET_V2', 'Token Bearer dla /api/public/ride-alerts');
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.__store_cron_secret_v2(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__store_cron_secret_v2(text) TO service_role, sandbox_exec;