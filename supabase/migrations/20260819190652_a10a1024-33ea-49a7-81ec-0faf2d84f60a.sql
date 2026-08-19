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

REVOKE ALL ON FUNCTION public.change_group_member_role(uuid, public.group_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.change_group_member_role(uuid, public.group_role) FROM anon;
GRANT EXECUTE ON FUNCTION public.change_group_member_role(uuid, public.group_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_group_member_role(uuid, public.group_role) TO service_role;

DROP POLICY IF EXISTS "Wlasciciel zarzadza rolami w grupie" ON public.group_members;