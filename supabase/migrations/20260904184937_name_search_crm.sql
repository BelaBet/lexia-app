-- CRM de busca de processos por NOME ("Buscar Processos"): diferente da
-- integração de monitoramento por CPF/CNPJ/OAB já existente
-- (publication_integrations / poll-jusbrasil), esta é uma busca assíncrona
-- e paga por relatório no JusBrasil (pode levar até 72h), disparada sob
-- demanda pelo usuário e organizada como um Kanban (Novo / Em análise /
-- Relevante / Descartado) por processo encontrado.
--
-- NOTA: esta migração foi reconstruída a partir do schema já aplicado em
-- produção (projeto dtpyeytvawomzkcihmsy), pois o arquivo não havia sido
-- versionado no repositório. Reflete fielmente as tabelas, policies,
-- triggers e bucket de storage existentes no banco.

-- process_search_charges (contador financeiro) precisa aceitar os novos
-- tipos de cobrança gerados pela busca por nome e pelo download de autos.

ALTER TABLE public.process_search_charges DROP CONSTRAINT IF EXISTS process_search_charges_document_type_check;
ALTER TABLE public.process_search_charges
  ADD CONSTRAINT process_search_charges_document_type_check
  CHECK (document_type = ANY (ARRAY['cpf'::text, 'cnpj'::text, 'oab'::text, 'nome'::text, 'outro'::text]));

ALTER TABLE public.process_search_charges DROP CONSTRAINT IF EXISTS process_search_charges_search_type_check;
ALTER TABLE public.process_search_charges
  ADD CONSTRAINT process_search_charges_search_type_check
  CHECK (search_type = ANY (ARRAY['manual'::text, 'poll'::text, 'busca_nome'::text, 'autos'::text]));

-- Tabela: process_search_reports ---------------------------------------
-- Uma "busca" (relatório do JusBrasil) por nome informado pelo usuário.

CREATE TABLE public.process_search_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  integration_id UUID REFERENCES public.publication_integrations(id) ON DELETE SET NULL,
  search_name TEXT NOT NULL,
  jusbrasil_report_id TEXT,
  status TEXT NOT NULL DEFAULT 'criando' CHECK (status IN ('criando', 'processando', 'concluido', 'erro')),
  distribuido_from DATE,
  distribuido_to DATE,
  result_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  billed_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_process_search_reports_user ON public.process_search_reports (user_id);

ALTER TABLE public.process_search_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam suas próprias buscas"
ON public.process_search_reports FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_process_search_reports
  BEFORE UPDATE ON public.process_search_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: process_search_results -----------------------------------------
-- Um processo encontrado dentro de uma busca — o card do Kanban.

CREATE TABLE public.process_search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES public.process_search_reports(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  process_number TEXT,
  tribunal TEXT,
  data_distribuicao DATE,
  area TEXT,
  natureza TEXT,
  valor NUMERIC,
  partes_ativas JSONB,
  partes_passivas JSONB,
  advogados JSONB,
  comarca TEXT,
  foro TEXT,
  vara TEXT,
  ultima_movimentacao_data DATE,
  ultima_movimentacao_tipo TEXT,
  ultima_movimentacao_texto TEXT,
  juiz TEXT,
  total_movimentacoes INTEGER,
  sentenca_data DATE,
  sentenca_texto TEXT,
  status_processual TEXT,
  data_extincao DATE,
  url_detalhes TEXT,
  raw_data JSONB,
  pipeline_stage TEXT NOT NULL DEFAULT 'novo'
    CHECK (pipeline_stage IN ('novo', 'em_analise', 'relevante', 'descartado', 'convertido')),
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  notes TEXT,
  autos_status TEXT NOT NULL DEFAULT 'nao_solicitado'
    CHECK (autos_status IN ('nao_solicitado', 'solicitado', 'pronto', 'erro')),
  autos_requested_at TIMESTAMP WITH TIME ZONE,
  autos_ready_at TIMESTAMP WITH TIME ZONE,
  autos_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (report_id, process_number)
);

CREATE INDEX idx_process_search_results_report ON public.process_search_results (report_id);
CREATE INDEX idx_process_search_results_user ON public.process_search_results (user_id);
CREATE INDEX idx_process_search_results_stage ON public.process_search_results (pipeline_stage);

ALTER TABLE public.process_search_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam os processos das suas buscas"
ON public.process_search_results FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER set_updated_at_process_search_results
  BEFORE UPDATE ON public.process_search_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela: process_search_documents ---------------------------------------
-- Documentos/autos baixados do JusBrasil para um processo encontrado.

CREATE TABLE public.process_search_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.process_search_results(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT,
  source_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_process_search_documents_result ON public.process_search_documents (result_id);

ALTER TABLE public.process_search_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam os documentos das suas buscas"
ON public.process_search_documents FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Storage: bucket privado para autos processuais baixados ------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('process-search-documents', 'process-search-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Usuários acessam seus próprios autos processuais"
ON storage.objects FOR ALL
USING (bucket_id = 'process-search-documents' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'process-search-documents' AND (storage.foldername(name))[1] = auth.uid()::text);
