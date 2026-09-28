-- CRÍTICO: admin_set_user_role() é uma função SECURITY DEFINER exposta via
-- RPC direto a "authenticated" (ver migration
-- 20260921161737_harden_rpc_and_index_foreign_keys.sql). A Edge Function
-- admin-update-role aplica corretamente as regras de negócio antes de
-- chamá-la:
--   1) ninguém pode alterar a própria role;
--   2) só quem já é "supremo" pode atribuir a role "supremo" a alguém;
--   3) só "supremo" pode alterar a role de outro "supremo".
-- Só que a função SQL em si NUNCA verificava nada disso — só exigia que o
-- chamador tivesse role 'admin' (e nem aceitava 'supremo', por checar
-- has_role(...,'admin') em vez de is_platform_admin()). Como a função está
-- liberada para "authenticated" via RPC direto (supabase.rpc(...) no
-- console do navegador, por exemplo), qualquer usuário com role 'admin'
-- podia chamar admin_set_user_role(auth.uid(), 'supremo') diretamente e se
-- autopromover ao nível mais alto de privilégio da plataforma, contornando
-- por completo a proteção da Edge Function. Corrigido replicando as MESMAS
-- regras dentro da própria função — a única barreira real contra chamadas
-- diretas é o que está aqui, nunca no cliente/Edge Function.

create or replace function public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_is_supremo boolean;
  v_caller_is_admin boolean;
  v_target_is_supremo boolean;
begin
  if auth.uid() is null then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  v_caller_is_supremo := public.has_role(auth.uid(), 'supremo');
  v_caller_is_admin := v_caller_is_supremo or public.has_role(auth.uid(), 'admin');

  if not v_caller_is_admin then
    raise exception 'Não autorizado' using errcode = '42501';
  end if;

  if p_target_user_id = auth.uid() then
    raise exception 'Você não pode alterar sua própria role' using errcode = '42501';
  end if;

  if p_new_role = 'supremo' and not v_caller_is_supremo then
    raise exception 'Somente Supremo pode atribuir a role Supremo' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.user_roles where user_id = p_target_user_id and role = 'supremo'
  ) into v_target_is_supremo;

  if v_target_is_supremo and not v_caller_is_supremo then
    raise exception 'Somente Supremo pode alterar outro Supremo' using errcode = '42501';
  end if;

  delete from public.user_roles where user_id = p_target_user_id;
  insert into public.user_roles (user_id, role) values (p_target_user_id, p_new_role);
end;
$$;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public, anon;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to authenticated, service_role;
