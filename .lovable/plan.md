# Plan: zmiana ról członków grupy przez jedną funkcję RPC

## Cel
Zmiana roli członka grupy przestaje być bezpośrednim PATCH-em z przeglądarki i przechodzi do jednej funkcji bazodanowej. Dozwolone są wyłącznie role `member` i `moderator`; roli `owner` nie można nadać ani odebrać. Transfer własności grupy pozostaje poza zakresem.

## Analiza obecnych UPDATE na public.group_members
W kodzie są dokładnie dwa miejsca:
1. `src/lib/groups.ts` → `setMemberRole()` — `update({ role })` (jedyna zmiana roli, przenoszona do RPC).
2. `src/lib/groups.ts` → `acceptInvite()` — `update({ status: 'accepted' })`, obsługiwana polityką „Zaproszony akceptuje wlasne zaproszenie” (bez zmian).

UI: `src/routes/_authenticated/grupy.tsx` (select roli) już oferuje tylko `member` i `moderator` — opcja `owner` nie jest i nie będzie pokazywana. Wiersz właściciela nie ma selecta.

## Minimalna zmiana polityk RLS
Po przeniesieniu do RPC jedynym zadaniem polityki UPDATE „Wlasciciel zarzadza rolami w grupie” był bezpośredni PATCH roli — a tego właśnie nie chcemy już dopuszczać z przeglądarki. Dlatego minimalna zmiana to usunięcie tej jednej polityki:
- `DROP POLICY "Wlasciciel zarzadza rolami w grupie" ON public.group_members;`
- funkcja `SECURITY DEFINER` (właściciel: `postgres`) omija RLS, więc RPC działa dalej;
- polityka „Zaproszony akceptuje wlasne zaproszenie” zostaje nietknięta → akceptacja `pending -> accepted` działa jak dotąd;
- polityki SELECT / INSERT / DELETE bez zmian, więc zapraszanie, podglądanie składu i usuwanie członkostwa działają jak dotąd.

## Trigger guard_group_member_role
Trigger `group_members_guard_role` (BEFORE UPDATE) zostaje włączony i bez zmian:
- wywołanie z RPC ma `auth.uid()` = właściciel grupy lub admin, więc pierwsza gałąź funkcji zwraca `NEW` i UPDATE przechodzi;
- akceptacja zaproszenia dalej wpada w drugą gałąź;
- każda inna próba (gdyby ktoś dostał UPDATE inną drogą) wciąż kończy się wyjątkiem.
Kolejność: RLS/uprawnienia → BEFORE UPDATE guard → `touch_updated_at`. Brak konfliktu, brak zmian.

## Migracja SQL (do wdrożenia po akceptacji)
```sql
BEGIN;

-- 1) RPC: jedyna dozwolona droga zmiany roli członka grupy
CREATE OR REPLACE FUNCTION public.change_group_member_role(
  p_member_id uuid,
  p_new_role public.group_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_member public.group_members;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Musisz byc zalogowany, zeby zmieniac role w grupie';
  END IF;

  SELECT * INTO v_member
  FROM public.group_members
  WHERE id = p_member_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nie znalazlem takiego czlonkostwa';
  END IF;

  IF NOT (
    public.has_role(v_caller, 'admin')
    OR public.is_group_owner(v_member.group_id, v_caller)
  ) THEN
    RAISE EXCEPTION 'Tylko wlasciciel grupy lub administrator moze zmieniac role';
  END IF;

  IF p_new_role IS NULL
     OR p_new_role NOT IN ('member', 'moderator') THEN
    RAISE EXCEPTION 'Dozwolone role to member albo moderator';
  END IF;

  IF v_member.role = 'owner' THEN
    RAISE EXCEPTION 'Nie mozna zmienic roli wlasciciela grupy';
  END IF;

  UPDATE public.group_members
  SET role = p_new_role
  WHERE id = p_member_id;
END;
$$;

-- 2) Uprawnienia do RPC
REVOKE ALL ON FUNCTION public.change_group_member_role(uuid, public.group_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_group_member_role(uuid, public.group_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_group_member_role(uuid, public.group_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_group_member_role(uuid, public.group_role) TO service_role;

-- 3) Odcięcie bezpośredniego PATCH-a zmieniajacego role z przegladarki
DROP POLICY IF EXISTS "Wlasciciel zarzadza rolami w grupie" ON public.group_members;

COMMIT;
```

## Zmiany w plikach aplikacji
`src/lib/groups.ts` — `setMemberRole` przestaje robić PATCH:
```ts
/** Zmiana roli członka — wyłącznie przez RPC (baza pilnuje uprawnień i zakresu ról). */
export async function setMemberRole(memberId: string, role: Exclude<GroupRole, "owner">) {
  const { error } = await supabase.rpc("change_group_member_role", {
    p_member_id: memberId,
    p_new_role: role,
  });
  if (error) throw error;
}
```
`src/routes/_authenticated/grupy.tsx` — jedyna korekta typu przy wywołaniu (`as "member" | "moderator"`); select nadal pokazuje tylko te dwie role. Żadnych innych zmian w zarządzaniu grupą.

## Testy po wdrożeniu
1. Owner: `member -> moderator` — OK.
2. Owner: `moderator -> member` — OK.
3. `owner` nie jest dostępny w UI, a RPC z `p_new_role = 'owner'` → wyjątek.
4. RPC na rekordzie o roli `owner` → wyjątek.
5. Zwykły członek wywołujący RPC → „Tylko wlasciciel grupy lub administrator…”.
6. Zaproszony: akceptacja `pending -> accepted` działa.
7. Bezpośredni PATCH `PATCH /group_members?id=eq…{role}` z przeglądarki → odrzucony (brak polityki UPDATE dla właściciela).
