-- Naprawa harmonogramu alertow wypraw: job musi wysylac naglowek Authorization: Bearer <CRON_SECRET_V2>.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
DECLARE
  v_len integer;
BEGIN
  -- Walidacja: sekret musi istniec w Vault i byc niepusty (wartosc nie jest nigdzie ujawniana)
  SELECT length(btrim(coalesce(s.decrypted_secret, '')))
  INTO v_len
  FROM vault.decrypted_secrets s
  WHERE s.name = 'CRON_SECRET_V2';

  IF v_len IS NULL THEN
    RAISE EXCEPTION 'Brak sekretu CRON_SECRET_V2 w Vault - nie tworze joba bez autoryzacji';
  END IF;
  IF v_len < 16 THEN
    RAISE EXCEPTION 'Sekret CRON_SECRET_V2 w Vault jest pusty lub zbyt krotki - nie tworze joba bez autoryzacji';
  END IF;

  -- Usuwamy stary job, jesli istnieje
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ride-alerts-hourly') THEN
    PERFORM cron.unschedule('ride-alerts-hourly');
  END IF;

  PERFORM cron.schedule(
    'ride-alerts-hourly',
    '15 * * * *',
    $job$
    select net.http_post(
      url := 'https://project--b4e20236-8294-4664-a20f-3034c8b138f6.lovable.app/api/public/ride-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select btrim(decrypted_secret)
          from vault.decrypted_secrets
          where name = 'CRON_SECRET_V2'
        )
      ),
      body := '{}'::jsonb
    );
    $job$
  );
END;
$$;

-- Funkcja pomocnicza uzyta do zapisania sekretu nie jest dalej potrzebna
DROP FUNCTION IF EXISTS public.__store_cron_secret_v2(text);