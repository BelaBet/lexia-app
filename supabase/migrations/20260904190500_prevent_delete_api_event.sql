-- Trava de exclusão para eventos criados automaticamente pela integração
-- (prazo de uma publicação importada via Monitoramento/JusBrasil): o botão
-- de excluir some na tela e vira um cadeado, mas isso sozinho não impede
-- exclusão direta pelo banco — este gatilho garante a trava também no
-- nível de dados. Só a própria integração (rodando como service_role, ao
-- perceber que o prazo de origem não existe mais) pode remover esses
-- eventos.
--
-- NOTA: esta migração foi reconstruída a partir do schema já aplicado em
-- produção (projeto dtpyeytvawomzkcihmsy), pois o arquivo não havia sido
-- versionado no repositório.

CREATE OR REPLACE FUNCTION public.prevent_delete_api_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if old.publication_id is not null and current_user <> 'service_role' then
    raise exception 'Eventos criados automaticamente via integração (publicação %) não podem ser excluídos.', old.publication_id
      using errcode = '42501';
  end if;
  return old;
end;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_delete_api_event ON public.events;

CREATE TRIGGER trg_prevent_delete_api_event
  BEFORE DELETE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_delete_api_event();
