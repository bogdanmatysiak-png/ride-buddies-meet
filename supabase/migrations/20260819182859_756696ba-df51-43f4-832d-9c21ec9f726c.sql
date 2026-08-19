-- 1) Tighten the self-invite-acceptance policy
DROP POLICY IF EXISTS "Zaproszony akceptuje wlasne zaproszenie"
ON public.group_members;

CREATE POLICY "Zaproszony akceptuje wlasne zaproszenie"
ON public.group_members
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND status = 'pending'
)
WITH CHECK (
  user_id = auth.uid()
  AND status = 'accepted'
);

-- 2) Harden the BEFORE UPDATE trigger guard function
CREATE OR REPLACE FUNCTION public.guard_group_member_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Admins and group owners keep full membership/role management rights
  IF public.has_role(auth.uid(), 'admin')
     OR public.is_group_owner(OLD.group_id, auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Non-owners/non-admins may only accept their own pending invitation
  IF (
    OLD.user_id = auth.uid()
    AND NEW.id IS NOT DISTINCT FROM OLD.id
    AND OLD.status = 'pending'
    AND NEW.status = 'accepted'
    AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
    AND NEW.group_id IS NOT DISTINCT FROM OLD.group_id
    AND NEW.invited_by IS NOT DISTINCT FROM OLD.invited_by
    AND NEW.role IS NOT DISTINCT FROM OLD.role
    AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Mozesz jedynie zaakceptowac wlasne oczekujace zaproszenie';
END;
$$;
