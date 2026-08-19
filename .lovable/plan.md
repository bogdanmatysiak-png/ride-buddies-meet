# Bezpieczny cron `ride-alerts-hourly` (sekret nigdy nie jawny) — v2

## Zasada
Endpoint zostaje bez zmian: dalej weryfikuje `Authorization: Bearer` względem `CRON_SECRET` po stronie serwera. Cron nie trzyma sekretu w `cron.job` — pobiera go w czasie wykonania z Supabase Vault. Rotacja ustawia tę samą losową wartość w obu miejscach, bez pokazywania jej gdziekolwiek.

## 1. Migracja SQL (proponowana, jeszcze nie wdrożona)

```sql
create extension if not exists pgcrypto;
create extension if not exists supabase_vault;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Wywołanie endpointu: token czytany dopiero w momencie uruchomienia
create or replace function public.invoke_ride_alerts()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, vault
as $$
declare tok text; req bigint;
begin
  select decrypted_secret into tok
  from vault.decrypted_secrets
  where name = 'cron_ride_alerts_token';

  if tok is null then
    raise exception 'missing cron secret';
  end if;

  select net.http_post(
    url := 'https://project--b4e20236-8294-4664-a20f-3034c8b138f6.lovable.app/api/public/ride-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || tok
    ),
    body := '{}'::jsonb
  ) into req;

  return req;
end $$;

revoke all on function public.invoke_ride_alerts() from public;
revoke all on function public.invoke_ride_alerts() from anon;
revoke all on function public.invoke_ride_alerts() from authenticated;

-- Harmonogram: w cron.job trafia tylko nazwa funkcji
select cron.unschedule('ride-alerts-hourly')
where exists (select 1 from cron.job where jobname = 'ride-alerts-hourly');

select cron.schedule('ride-alerts-hourly', '15 * * * *', $$select public.invoke_ride_alerts();$$);
```

Brak `verify_cron_token`, brak nowej funkcji SECURITY DEFINER do porównywania sekretu, brak `grant execute` dla roli publicznej.

## 2. Zmiany kodu
Żadnych. `src/routes/api/public/ride-alerts.ts` pozostaje jak jest: tylko POST (GET → 405), stałoczasowe porównanie z `process.env.CRON_SECRET`, brak CORS, błędy jako `{ ok: false }` bez szczegółów.

## 3. Rotacja sekretu (nigdzie nie jawna)
Wykonywana narzędziami, nie migracją:
1. Losowa wartość (32 bajty hex) generowana w izolowanym kroku — nie trafia do czatu ani do żadnego pliku w repo.
2. Zapis jako `CRON_SECRET` w sekretach serwera aplikacji.
3. Zapis tej samej wartości w Vault jako `cron_ride_alerts_token` (`vault.create_secret` / `vault.update_secret`) przez jednorazowe polecenie SQL wykonane narzędziem, nie zapisywane jako migracja.

## 4. Test po wdrożeniu
`select public.invoke_ride_alerts();`, następnie odczyt najnowszego wpisu z `net._http_response` — raportuję wyłącznie `status_code` (bez nagłówków, bez treści sekretu).
