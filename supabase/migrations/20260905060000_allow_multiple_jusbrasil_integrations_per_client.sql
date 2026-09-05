-- O fluxo "Novo Cliente" (migration 20260905040000) cria uma linha NOVA em
-- publication_integrations por cliente (cada uma com seu próprio
-- monitor_name e linked_client_id), para poder rastrear e auto-vincular a
-- busca por nome daquele cliente especificamente.
--
-- Isso colide com a constraint publication_integrations_user_id_source_key
-- (UNIQUE em user_id+source): qualquer usuário que já tivesse uma
-- integração "principal" do JusBrasil configurada em Integrações (o caso
-- comum, já que é dali que vem a criação automática de processos) teria o
-- INSERT do "Novo Cliente" rejeitado com violação de unicidade — e mesmo
-- sem a constraint, supabase.functions publication-webhook usa
-- .maybeSingle() ao buscar a integração por user_id+source, que passaria a
-- falhar (erro do PostgREST) assim que existisse mais de uma linha.
--
-- Correção: substitui a constraint antiga por uma unique parcial que só
-- vale para a integração "principal" (linked_client_id IS NULL) — a usada
-- pela tela de Integrações e pelo webhook em tempo real. Continua
-- impedindo duas integrações "principais" do mesmo provedor para o mesmo
-- usuário, mas permite quantas integrações "por cliente" (linked_client_id
-- preenchido) forem necessárias.
alter table public.publication_integrations
  drop constraint if exists publication_integrations_user_id_source_key;

create unique index if not exists publication_integrations_primary_per_source
  on public.publication_integrations (user_id, source)
  where (linked_client_id is null);

comment on index public.publication_integrations_primary_per_source is
  'Só permite UMA integração "principal" (linked_client_id nulo, gerenciada em Integrações e usada pelo webhook em tempo real) por usuário+provedor. Integrações criadas pelo fluxo "Novo Cliente" (linked_client_id preenchido) não entram nessa restrição — pode haver uma por cliente.';
