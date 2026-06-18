
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
-- keep authenticated EXECUTE on has_role (RLS policies use it via auth.uid())
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
