-- Defense in depth: browser roles only need read access to user_roles.
-- Mutations are performed by trusted SECURITY DEFINER/service-role flows.
revoke all privileges on table public.user_roles from anon;
revoke all privileges on table public.user_roles from authenticated;
grant select on table public.user_roles to authenticated;
