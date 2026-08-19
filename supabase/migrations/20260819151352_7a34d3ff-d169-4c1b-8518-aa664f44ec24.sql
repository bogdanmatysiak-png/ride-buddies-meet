CREATE OR REPLACE FUNCTION public.can_read_chat_photo(_object_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ride_messages m
    WHERE m.image_url = _object_name
      AND (
        EXISTS (SELECT 1 FROM public.rides r WHERE r.id = m.ride_id AND r.host_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.ride_participants rp WHERE rp.ride_id = m.ride_id AND rp.user_id = auth.uid())
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_read_chat_photo(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_chat_photo(text) FROM public;
GRANT EXECUTE ON FUNCTION public.can_read_chat_photo(text) TO authenticated;

DROP POLICY IF EXISTS "chat photos read" ON storage.objects;

CREATE POLICY "chat photos read ride members" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-photos'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR public.can_read_chat_photo(name)
  )
);