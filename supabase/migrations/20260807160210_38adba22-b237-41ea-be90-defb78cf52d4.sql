-- Remove the overly permissive public read policy on ride chat messages
DROP POLICY IF EXISTS "Wiadomosci sa publiczne" ON public.ride_messages;

-- Ensure anonymous users cannot access chat messages at all
REVOKE ALL ON public.ride_messages FROM anon;

-- Only the ride host and confirmed participants can read messages
CREATE POLICY "Uczestnicy i prowadzacy widza wiadomosci"
ON public.ride_messages
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.rides r
    WHERE r.id = ride_messages.ride_id
      AND r.host_id = auth.uid()
  )
  OR
  EXISTS (
    SELECT 1
    FROM public.ride_participants rp
    WHERE rp.ride_id = ride_messages.ride_id
      AND rp.user_id = auth.uid()
  )
);