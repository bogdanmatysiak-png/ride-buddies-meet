# Bezpieczny cron `ride-alerts-hourly` (sekret nigdy nie jawny)

## Zasada
Sekret harmonogramu żyje wyłącznie w Supabase Vault. Ani czat, ani repo, ani migracja, ani `cron.job` nie zawierają jego wartości — cron pobiera go w czasie wykonania, a endpoint weryfikuje go przez funkcję bazodanową.

## 1. Migracja SQL (proponowana, jeszcze nie wdrożona)

```sql
-- Vault + sieć + harmonogram
create extension if not exists supabase_vault;
create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Losowa wartość generowana w bazie: nigdzie nie zapisana jawnie
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'cron_ride_alerts_token') then
    perform vault.create_secret(encode(gen_random_bytes(32), 'hex'), 'cron_ride_alerts_token', 'Bearer token dla /api/public/ride-alerts');
  end if;
end $$;

-- Weryfikacja tokenu po stronie serwera (stały czas, bez zwracania wartości)
create or replace function public.verify_cron_token(_token text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, vault
as $$
declare v text;
begin
  select decrypted_secret into v from vault.decrypted_secrets where name = 'cron_ride_alerts_token';
  if v is null or _token is null then return false; end if;
  return length(v) = length(_token)
     and encode(digest(v, 'sha256'), 'hex') = encode(digest(_token, 'sha256'), 'hex');
end $$;

revoke all on function public.verify_cron_token(text) from public, anon, authenticated;
grant execute on function public.verify_cron_token(text) to service_role;

-- Wywołanie endpointu: sekret czytany dopiero w momencie uruchomienia
create or replace function public.invoke_ride_alerts()
returns bigint
language plpgsql
security definer
set search_path = public, vault
as $$
declare tok text; req bigint;
begin
  select decrypted_secret into tok from vault.decrypted_secrets where name = 'cron_ride_alerts_token';
  if tok is null then raise exception 'missing cron secret'; end if;
  select net.http_post(
    url := 'https://project--b4e20236-8294-4664-a20f-3034c8b138f6.lovable.app/api/public/ride-alerts',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || tok),
    body := '{}'::jsonb
  ) into req;
  return req;
end $$;

revoke all on function public.invoke_ride_alerts() from public, anon, authenticated;

-- Harmonogram: w cron.job trafia tylko nazwa funkcji
select cron.unschedule('ride-alerts-hourly')
where exists (select 1 from cron.job where jobname = 'ride-alerts-hourly');

select cron.schedule('ride-alerts-hourly', '15 * * * *', $$select public.invoke_ride_alerts();$$);
```

## 2. Zmiana kodu — `src/routes/api/public/ride-alerts.ts`

- Nadal wyłącznie POST (GET → 405), brak nagłówków CORS.
- Autoryzacja: token z `Authorization: Bearer ...` sprawdzany przez `verify_cron_token` wywołany klientem service_role (import wewnątrz handlera). Zachowane fallbackowe porównanie z `process.env.CRON_SECRET`, jeśli nadal ustawione — dzięki temu istniejący sekret aplikacji działa bez zmian.
- Brak tokenu / niepoprawny → 401 i `runRideAlerts()` się nie uruchamia.
- Błąd → `{ ok: false }` z 500, bez szczegółów i bez kluczy.

## 3. Test
Wywołanie `select public.invoke_ride_alerts();`, potem odczyt `net._http_response` — w odpowiedzi podam wyłącznie kod HTTP i ciało odpowiedzi endpointu (bez wartości sekretu).

## Uwaga
Sekret w Vault jest generowany w bazie i nie da się go „zobaczyć” przypadkowo — nie pojawi się w migracji, definicji crona ani w logach aplikacji.
