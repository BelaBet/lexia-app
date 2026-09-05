-- Permite ao advogado cadastrar o cliente primeiro e já disparar a busca
-- do processo dele no JusBrasil (fluxo "Novo Cliente"), em vez de só
-- conseguir vincular o cliente depois que o processo aparece sozinho.
--
-- Guarda, na própria integração/monitoramento (publication_integrations),
-- qual cliente deve ser automaticamente vinculado a qualquer processo
-- encontrado por ela — hoje (busca ativa diária ou "Buscar agora") e no
-- futuro, sem precisar repetir o vínculo manualmente a cada nova
-- movimentação encontrada para essa mesma pessoa.
alter table public.publication_integrations
  add column if not exists linked_client_id uuid references public.clients(id) on delete set null;

comment on column public.publication_integrations.linked_client_id is
  'Cliente (public.clients) a vincular automaticamente a qualquer processo encontrado por esta integração — usado pelo fluxo "Novo Cliente" (cadastra o cliente e já busca o processo dele pelo nome).';
