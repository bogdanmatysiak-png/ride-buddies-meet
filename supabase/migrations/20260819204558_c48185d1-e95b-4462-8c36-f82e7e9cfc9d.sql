DROP POLICY IF EXISTS "Zaproszony akceptuje wlasne zaproszenie" ON public.group_members;

CREATE POLICY "Zaproszony akceptuje wlasne zaproszenie"
ON public.group_members
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND status = 'pending'::group_member_status
  AND role = 'member'::group_role
)
WITH CHECK (
  user_id = auth.uid()
  AND status = 'accepted'::group_member_status
  AND role = 'member'::group_role
);