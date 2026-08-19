# Plan: Fix critical group role escalation vulnerability

## Goal
Prevent group members from granting themselves elevated roles while still allowing invitees to accept only their own pending invitations.

## Problem
The current permissive UPDATE policy `"Zaproszony akceptuje wlasne zaproszenie"` and the current `public.guard_group_member_role()` function only block unauthorized role changes loosely. A logged-in group member can potentially update their own `group_members` row and change `role`, `group_id`, `user_id`, `invited_by`, or `created_at` in the same statement that flips `status` to `accepted`.

## Migration
File: `supabase/migrations/20260819182300_219bb6f0-3925-49df-a128-edccd092adf3.sql`

### 1) Replace the policy
DROP and re-create the exact-named policy so a user can only attempt to update their own pending invitation row, and the resulting row must have `status = 'accepted'`.

### 2) Recreate the trigger guard function
`CREATE OR REPLACE FUNCTION public.guard_group_member_role()` with the same signature:
- `RETURNS trigger`
- `LANGUAGE plpgsql`
- `SECURITY DEFINER`
- `SET search_path TO 'public'`

Logic:
- If the caller is an admin (`public.has_role(auth.uid(), 'admin')`) or the owner of the group referenced by `OLD.group_id`, return `NEW` unchanged.
- Otherwise, only allow the update when the caller is updating their own pending invitation to `accepted` and leaves every other tracked column unchanged (`user_id`, `group_id`, `invited_by`, `role`, `created_at`).
- `updated_at` is not compared because `public.touch_updated_at()` will modify it.
- Any other change raises `RAISE EXCEPTION 'Mozesz jedynie zaakceptowac wlasne oczekujace zaproszenie'`.

## What is NOT changed
- Table schema (`public.group_members`).
- Existing trigger bindings (`group_members_guard_role` continues to call `public.guard_group_member_role()`; no new trigger is created).
- Other RLS policies on `public.group_members` or other tables.
- EXECUTE grants on the function.

## Migration SQL
```sql
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
```

## Verification before deployment
1. Confirm the migration file contains only the exact policy and function above.
2. Confirm no other RLS policy or trigger is altered.
3. After your approval, the migration can be applied via the Supabase migration tool.

## Deployment
Apply via the Supabase migration tool after approval.
