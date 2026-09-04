// Hooks do CRM de "Buscar Processos" — busca por nome no JusBrasil,
// organização dos resultados em Kanban (pipeline_stage) e download dos
// autos processuais (com trava de download única).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ReportStatus = "criando" | "processando" | "concluido" | "erro";
export type PipelineStage = "novo" | "em_analise" | "relevante" | "descartado" | "convertido";
export type AutosStatus = "nao_solicitado" | "solicitado" | "pronto" | "erro";

export interface SearchReport {
  id: string;
  search_name: string;
  status: ReportStatus;
  result_count: number;
  error_message: string | null;
  requested_at: string;
  completed_at: string | null;
}

export interface SearchResult {
  id: string;
  report_id: string;
  process_number: string | null;
  tribunal: string | null;
  data_distribuicao: string | null;
  area: string | null;
  natureza: string | null;
  valor: number | null;
  partes_ativas: unknown;
  partes_passivas: unknown;
  advogados: unknown;
  comarca: string | null;
  foro: string | null;
  vara: string | null;
  ultima_movimentacao_data: string | null;
  ultima_movimentacao_tipo: string | null;
  ultima_movimentacao_texto: string | null;
  juiz: string | null;
  status_processual: string | null;
  pipeline_stage: PipelineStage;
  case_id: string | null;
  notes: string | null;
  autos_status: AutosStatus;
  autos_download_locked: boolean;
  autos_downloaded_at: string | null;
  autos_error: string | null;
}

export interface SearchDocument {
  id: string;
  result_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  created_at: string;
}

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    // supabase-js não expõe o corpo de erro em `error` para respostas
    // non-2xx via functions.invoke em todas as versões — tenta extrair a
    // mensagem que a função devolveu.
    //
    // Corrigido: a mensagem extraída do corpo da resposta era lançada
    // (throw) dentro do MESMO try cujo catch a capturava e descartava,
    // caindo sempre no erro genérico de `error.message` abaixo — o usuário
    // nunca via o motivo real retornado pelo backend (ex.: "Integração não
    // encontrada"). Agora o valor extraído só é usado para montar o erro
    // final, fora do try/catch de parsing.
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    let backendMessage: string | null = null;
    if (context?.json) {
      try {
        const parsed = (await context.json()) as { error?: string };
        if (parsed?.error) backendMessage = parsed.error;
      } catch {
        // corpo da resposta não é JSON válido — ignora, cai no erro genérico abaixo
      }
    }
    throw new Error(backendMessage || error.message || "Erro ao chamar função");
  }
  return data as T;
}

export function useSearchReports() {
  return useQuery({
    queryKey: ["process-search", "reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_search_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SearchReport[];
    },
  });
}

export function useSearchResults(reportId: string | undefined) {
  return useQuery({
    queryKey: ["process-search", "results", reportId],
    enabled: Boolean(reportId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_search_results")
        .select("*")
        .eq("report_id", reportId as string)
        .order("data_distribuicao", { ascending: false });
      if (error) throw error;
      return data as SearchResult[];
    },
  });
}

export function useResultDocuments(resultId: string | undefined) {
  return useQuery({
    queryKey: ["process-search", "documents", resultId],
    enabled: Boolean(resultId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_search_documents")
        .select("*")
        .eq("result_id", resultId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as SearchDocument[];
    },
  });
}

export function useCreateNameSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => callFunction<{ success: boolean; report_id: string; message: string }>("create-name-search", { name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-search", "reports"] });
    },
  });
}

export function useCheckNameSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => callFunction<{ success: boolean; status: string; imported?: number; message?: string }>("check-name-search", { report_id: reportId }),
    onSuccess: (_data, reportId) => {
      queryClient.invalidateQueries({ queryKey: ["process-search", "reports"] });
      queryClient.invalidateQueries({ queryKey: ["process-search", "results", reportId] });
    },
  });
}

export function useMoveResultStage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resultId, stage }: { resultId: string; stage: PipelineStage }) => {
      const { error } = await supabase.from("process_search_results").update({ pipeline_stage: stage }).eq("id", resultId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["process-search", "results"] });
    },
  });
}

export function useUpdateResultNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resultId, notes }: { resultId: string; notes: string }) => {
      const { error } = await supabase.from("process_search_results").update({ notes }).eq("id", resultId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-search", "results"] });
    },
  });
}

// "Baixar autos" — trava depois do primeiro sucesso; um erro 403 aqui
// significa que já foi baixado antes e precisa de liberação de um admin.
export function useRequestCaseAutos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resultId: string) => callFunction<{ success: boolean; documents_saved?: number; locked?: boolean }>("request-case-autos", { result_id: resultId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-search", "results"] });
      queryClient.invalidateQueries({ queryKey: ["process-search", "documents"] });
    },
  });
}

// Só funciona se quem chamar tiver role admin/supremo — a própria função
// valida isso no servidor (independente do que a tela mostrar).
export function useUnlockAutosDownload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resultId, reason }: { resultId: string; reason?: string }) =>
      callFunction<{ success: boolean }>("admin-unlock-autos-download", { result_id: resultId, reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process-search", "results"] });
    },
  });
}

export async function getSearchDocumentDownloadUrl(path: string) {
  const { data, error } = await supabase.storage.from("process-search-documents").createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}
