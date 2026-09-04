import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// "Buscar Processos" — CRM de busca de processos por NOME no JusBrasil.
// Diferente da integração de monitoramento por CPF/CNPJ/OAB (poll-jusbrasil
// / publication_integrations), aqui a busca é sob demanda, paga por
// relatório e assíncrona (pode levar até 72h para o JusBrasil concluir).
// Cada processo encontrado vira um card num Kanban (pipeline_stage) e pode
// ter os autos processuais baixados uma única vez (trava de download,
// liberável só por um admin).

export type PipelineStage = "novo" | "em_analise" | "relevante" | "descartado" | "convertido";
export type ReportStatus = "criando" | "processando" | "concluido" | "erro";
export type AutosStatus = "nao_solicitado" | "solicitado" | "pronto" | "erro";

export interface ProcessSearchReport {
  id: string;
  user_id: string;
  integration_id: string | null;
  search_name: string;
  jusbrasil_report_id: string | null;
  status: ReportStatus;
  result_count: number;
  error_message: string | null;
  requested_at: string;
  billed_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessSearchResult {
  id: string;
  report_id: string;
  user_id: string;
  process_number: string | null;
  tribunal: string | null;
  data_distribuicao: string | null;
  area: string | null;
  natureza: string | null;
  valor: number | null;
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
  autos_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProcessSearchDocument {
  id: string;
  result_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
}

export function useProcessSearchReports() {
  return useQuery({
    queryKey: ["process_search_reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_search_reports")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ProcessSearchReport[];
    },
  });
}

export function useProcessSearchResults(reportId: string | null) {
  return useQuery({
    queryKey: ["process_search_results", reportId],
    queryFn: async () => {
      if (!reportId) return [];
      const { data, error } = await supabase
        .from("process_search_results")
        .select("*")
        .eq("report_id", reportId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ProcessSearchResult[];
    },
    enabled: !!reportId,
  });
}

export function useProcessSearchDocuments(resultId: string | null) {
  return useQuery({
    queryKey: ["process_search_documents", resultId],
    queryFn: async () => {
      if (!resultId) return [];
      const { data, error } = await supabase
        .from("process_search_documents")
        .select("*")
        .eq("result_id", resultId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ProcessSearchDocument[];
    },
    enabled: !!resultId,
  });
}

// Dispara a edge function create-name-search, que cria o relatório no
// JusBrasil e já inicia a cobrança — pode levar até 72h para o resultado
// ficar pronto (ver useCheckNameSearch).
export function useCreateNameSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const { data, error } = await supabase.functions.invoke("create-name-search", { body: { name } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; report_id: string; message: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["process_search_reports"] });
      toast.success(data.message || "Busca iniciada.");
    },
    onError: (error: Error) => {
      console.error("Error creating name search:", error);
      toast.error(error.message || "Erro ao iniciar busca");
    },
  });
}

// Tenta buscar o resultado de uma busca pendente. Se o JusBrasil ainda não
// tiver concluído (pode levar até 72h), apenas avisa para tentar depois.
export function useCheckNameSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data, error } = await supabase.functions.invoke("check-name-search", { body: { report_id: reportId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; status: ReportStatus; imported?: number; message?: string };
    },
    onSuccess: (data, reportId) => {
      queryClient.invalidateQueries({ queryKey: ["process_search_reports"] });
      queryClient.invalidateQueries({ queryKey: ["process_search_results", reportId] });
      if (data.status === "concluido") {
        toast.success(`Busca concluída: ${data.imported ?? 0} processo(s) encontrado(s).`);
      } else {
        toast.info(data.message || "Ainda processando no JusBrasil.");
      }
    },
    onError: (error: Error) => {
      console.error("Error checking name search:", error);
      toast.error(error.message || "Erro ao verificar resultado");
    },
  });
}

// Atualiza o estágio do Kanban (pipeline_stage) ou as notas de um processo
// encontrado — direto pela RLS (auth.uid() = user_id), sem passar por edge
// function, já que essas colunas não fazem parte da trava de autos.
export function useUpdateProcessSearchResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string } & Partial<Pick<ProcessSearchResult, "pipeline_stage" | "notes">>) => {
      const { error } = await supabase.from("process_search_results").update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["process_search_results"] });
      if (variables.pipeline_stage) toast.success("Estágio atualizado.");
    },
    onError: (error: Error) => {
      console.error("Error updating process search result:", error);
      toast.error("Erro ao atualizar processo");
    },
  });
}

// Dispara o download dos autos processuais — só funciona uma vez por
// processo (trava de download); depois disso, só um admin consegue liberar
// via useAdminUnlockAutosDownload.
export function useRequestCaseAutos() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (resultId: string) => {
      const { data, error } = await supabase.functions.invoke("request-case-autos", { body: { result_id: resultId } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean; documents_saved: number };
    },
    onSuccess: (data, resultId) => {
      queryClient.invalidateQueries({ queryKey: ["process_search_results"] });
      queryClient.invalidateQueries({ queryKey: ["process_search_documents", resultId] });
      toast.success(`${data.documents_saved} documento(s) baixado(s).`);
    },
    onError: (error: Error) => {
      console.error("Error requesting case autos:", error);
      toast.error(error.message || "Erro ao baixar autos");
    },
  });
}

// Libera um novo download dos autos de um processo já baixado — só
// admin/supremo (validado no backend pela edge function).
export function useAdminUnlockAutosDownload() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ resultId, reason }: { resultId: string; reason?: string }) => {
      const { data, error } = await supabase.functions.invoke("admin-unlock-autos-download", {
        body: { result_id: resultId, reason },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { success: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["process_search_results"] });
      toast.success("Novo download liberado.");
    },
    onError: (error: Error) => {
      console.error("Error unlocking autos download:", error);
      toast.error(error.message || "Erro ao liberar novo download");
    },
  });
}

export async function getProcessSearchDocumentUrl(filePath: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from("process-search-documents")
    .createSignedUrl(filePath, 60 * 5);
  if (error) {
    console.error("Error creating signed url for autos document:", error);
    return null;
  }
  return data.signedUrl;
}
