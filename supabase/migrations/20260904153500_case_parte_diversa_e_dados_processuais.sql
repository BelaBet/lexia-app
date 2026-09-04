-- Adiciona à tela de Casos o campo "Parte Diversa" (a parte contrária do
-- processo, além do Cliente já existente) e, tanto em Casos quanto em
-- Publicações, os dados processuais que passam a ser destacados no sistema
-- para cada processo: data de abertura no tribunal, data de aceitação,
-- valor da causa, vara e comarca. Esses campos são preenchidos manualmente
-- ou, quando disponíveis no payload, automaticamente pela integração
-- JusBrasil (poll-jusbrasil / publication-webhook).

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS parte_diversa TEXT,
  ADD COLUMN IF NOT EXISTS vara TEXT,
  ADD COLUMN IF NOT EXISTS comarca TEXT,
  ADD COLUMN IF NOT EXISTS valor_causa NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS data_abertura_tribunal DATE,
  ADD COLUMN IF NOT EXISTS data_aceitacao DATE;

COMMENT ON COLUMN public.cases.parte_diversa IS 'Parte contrária/adversa do processo (a outra parte além do Cliente)';
COMMENT ON COLUMN public.cases.vara IS 'Vara judicial responsável pelo processo';
COMMENT ON COLUMN public.cases.comarca IS 'Comarca (jurisdição/localidade) do processo';
COMMENT ON COLUMN public.cases.valor_causa IS 'Valor da causa/processo, em reais';
COMMENT ON COLUMN public.cases.data_abertura_tribunal IS 'Data de abertura/distribuição do processo no tribunal';
COMMENT ON COLUMN public.cases.data_aceitacao IS 'Data de aceitação do processo';

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS vara TEXT,
  ADD COLUMN IF NOT EXISTS comarca TEXT,
  ADD COLUMN IF NOT EXISTS valor_causa NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS data_abertura_tribunal DATE,
  ADD COLUMN IF NOT EXISTS data_aceitacao DATE;

COMMENT ON COLUMN public.publications.vara IS 'Vara judicial responsável pelo processo';
COMMENT ON COLUMN public.publications.comarca IS 'Comarca (jurisdição/localidade) do processo';
COMMENT ON COLUMN public.publications.valor_causa IS 'Valor da causa/processo, em reais';
COMMENT ON COLUMN public.publications.data_abertura_tribunal IS 'Data de abertura/distribuição do processo no tribunal';
COMMENT ON COLUMN public.publications.data_aceitacao IS 'Data de aceitação do processo';
