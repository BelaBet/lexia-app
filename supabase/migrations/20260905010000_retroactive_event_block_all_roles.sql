-- QA (revisão): a exceção de papéis admin/supremo na trava de evento
-- retroativo (ver 20260905000000_prevent_retroactive_event_backend.sql)
-- criava uma divergência real entre frontend e backend — a interface
-- bloqueia data passada para QUALQUER usuário (não existe, hoje, nenhum
-- controle na tela que deixe um admin/supremo escolher "criar mesmo assim"),
-- então a exceção no banco nunca era alcançável por ninguém através do
-- produto, só por quem chamasse a API diretamente. Em vez de construir uma
-- exceção que ninguém usa de verdade, a regra passa a ser absoluta para
-- todos os papéis de usuário: só a própria integração (service_role, ao
-- importar um prazo cuja data externa já passou) continua isenta.

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
  then
    raise exception 'Não é possível criar ou mover eventos para datas passadas.'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;
