-- Campo para o usuário informar o e-mail que deseja usar para receber
-- intimações judiciais eletrônicas (API de Intimações da JusBrasil). A
-- integração real com a API (que exige domínio liberado para consultar a
-- documentação e confirmar os nomes de campo do payload) ainda não foi
-- feita — por enquanto só guardamos o e-mail informado pelo usuário.

alter table public.user_settings
  add column if not exists intimacoes_email text;

comment on column public.user_settings.intimacoes_email is
  'E-mail que o usuário deseja cadastrar para receber intimações judiciais eletrônicas via integração JusBrasil. Ainda não sincronizado com a API externa.';
