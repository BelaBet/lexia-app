-- QA: a Agenda bloqueava a criação de eventos em datas passadas só na
-- interface (input date com `min` + validação em JS) — nada impedia a
-- mesma operação via chamada direta à API/banco. Regra de negócio
-- importante precisa ser garantida no backend, não só escondida no
-- frontend.
--
-- Esta trava vale tanto para INSERT (criar evento retroativo) quanto para
-- UPDATE que efetivamente MUDA a data de um evento existente para o
-- passado — editar outros campos (título, status, horário) de um evento
-- que já tinha uma data passada continua permitido normalmente, já que a
-- comparação é sempre contra o valor anterior (old.event_date), não contra
-- a data atual do sistema.
--
-- Exceções (permissão de evento retroativo):
--   - papéis admin/supremo (únicos níveis de permissão elevada já
--     existentes no sistema — não há um campo dedicado de "permissão de
--     evento retroativo" separado, então reaproveitamos os papéis mais
--     altos já usados em outras regras administrativas);
--   - service_role: a integração de publicações (JusBrasil/WebJur/
--     Escavador) cria automaticamente eventos de prazo_externo/
--     prazo_interno a partir de dados já publicados — um prazo importado
--     pode legitimamente já estar no passado no momento da importação
--     (atraso na sincronização), e isso não é uma tentativa de fraudar
--     data, é um fato que já existe fora do sistema. Mesmo padrão de
--     exceção usado na trava de exclusão de eventos via API (ver migração
--     20260904190500_prevent_delete_api_event.sql).

CREATE OR REPLACE FUNCTION public.prevent_retroactive_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if new.event_date < current_date
     and current_user <> 'service_role'
     and (tg_op = 'INSERT' or new.event_date is distinct from old.event_date)
     and not (public.has_role(new.user_id, 'admin'::app_role) or public.has_role(new.user_id, 'supremo'::app_role))
  then
    raise exception 'Não é possível criar ou mover eventos para datas passadas sem permissão de evento retroativo.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_retroactive_event ON public.events;

CREATE TRIGGER trg_prevent_retroactive_event
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_retroactive_event();
