-- BUG-01 (CasesManager.tsx mostrava contagem de documentos errada por
-- processo): a tabela `documents` não tinha nenhuma coluna relacionando um
-- documento a um processo, então uma correção só no código (filtrar por
-- caseId) não tinha como funcionar de verdade — era necessário criar esse
-- vínculo no banco primeiro.
alter table public.documents
  add column if not exists case_id uuid references public.cases(id) on delete set null;

create index if not exists idx_documents_case_id on public.documents (case_id);

comment on column public.documents.case_id is
  'Processo ao qual este documento pertence (opcional). Usado para a contagem de documentos por processo em Processos.';

-- BUG-04 (admin-update-role fazia delete() + insert() como duas chamadas
-- separadas — se o delete funcionasse e o insert falhasse, o usuário-alvo
-- ficava sem NENHUMA role gravada): esta função executa as duas operações
-- dentro de uma única transação de banco (uma chamada de função SQL é
-- atômica), então ou as duas acontecem juntas, ou nenhuma acontece.
create or replace function public.admin_set_user_role(p_target_user_id uuid, p_new_role public.app_role)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  delete from public.user_roles where user_id = p_target_user_id;
  insert into public.user_roles (user_id, role) values (p_target_user_id, p_new_role);
end;
$function$;

revoke all on function public.admin_set_user_role(uuid, public.app_role) from public;
grant execute on function public.admin_set_user_role(uuid, public.app_role) to service_role;
