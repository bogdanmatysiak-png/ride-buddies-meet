# Bezpieczny cron `ride-alerts-hourly` — v3 (bez żadnych funkcji pomocniczych)

## Zasada
Zero nowych funkcji (żadnej SECURITY DEFINER, żadnej w `public`). Job wykonuje bezpośrednio `net.http_post()`, a token czyta w czasie uruchomienia z `vault.decrypted_secrets`. Endpoint bez zmian — dalej porównuje `Authorization: Bearer` z serwerowym `CRON_SECRET`.

## 1. SQL harmonogramu (proponowany, jeszcze nie wdrożony)

```sql
create extension if not exists pgcrypto;
create extension if not exists supabase_vault;
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.unschedule('ride-alerts-hourly')
where exists (select 1 from cron.job where jobname = 'ride-alerts-hourly');

select cron.schedule(
  'ride-alerts-hourly',
  '15 * * * *',
  $$
  select net.http_post(
    url := 'https://ride-buddies-meet.lovable.app/api/public/ride-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'cron_ride_alerts_token'
      )
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);
```

W `cron.job.command` znajduje się wyłącznie zapytanie odczytujące sekret z Vault — nigdy jego wartość.

## 2. Zmiany kodu
Żadnych. `src/routes/api/public/ride-alerts.ts`: tylko POST (GET → 405), stałoczasowe porównanie z `process.env.CRON_SECRET`, brak CORS, błąd → `{ ok: false }`.

## 3. Warunki przed wdrożeniem (potwierdzane przez wykonanie, nie przez pokazanie wartości)
1. `cron_ride_alerts_token` istnieje w Vault — sprawdzę zapytaniem zwracającym wyłącznie `name` i `length(decrypted_secret)`.
2. Zgodność z serwerowym `CRON_SECRET`: aktualnej wartości `CRON_SECRET` nie da się odczytać, więc wykonam jednorazową rotację — jedna losowa wartość (32 bajty hex) zapisana równocześnie jako serwerowy `CRON_SECRET` oraz jako sekret Vault `cron_ride_alerts_token`. Wartość nie pojawia się w czacie, kodzie, repozytorium ani w migracji.
3. URL produkcyjny: `https://ride-buddies-meet.lovable.app/api/public/ride-alerts` (nie preview/dev).
4. Test: jednorazowe wykonanie tego samego `net.http_post(...)`, potem odczyt najnowszego `net._http_response` — raportuję wyłącznie `status_code` (oczekiwane 200), bez nagłówków i bez tokenu.

## Uwaga
Rotacja unieważnia dotychczasową wartość `CRON_SECRET` — po wdrożeniu poprawny jest tylko nowy token czytany z Vault przez crona.
