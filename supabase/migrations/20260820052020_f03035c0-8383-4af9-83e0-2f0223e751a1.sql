ALTER FUNCTION public.can_read_chat_photo(_object_name text) SET search_path = pg_catalog, public;
ALTER FUNCTION public.change_group_member_role(p_member_id uuid, p_new_role group_role) SET search_path = pg_catalog, public;
ALTER FUNCTION public.has_group_link(_group_id uuid, _user_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.has_role(_user_id uuid, _role app_role) SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) SET search_path = pg_catalog, public;
ALTER FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) SET search_path = pg_catalog, public;

REVOKE ALL ON FUNCTION public.can_read_chat_photo(_object_name text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.change_group_member_role(p_member_id uuid, p_new_role group_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_group_link(_group_id uuid, _user_id uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(_user_id uuid, _role app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.can_read_chat_photo(_object_name text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.change_group_member_role(p_member_id uuid, p_new_role group_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_group_link(_group_id uuid, _user_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(_user_id uuid, _role app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_member(_group_id uuid, _user_id uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_group_owner(_group_id uuid, _user_id uuid) TO authenticated, service_role;