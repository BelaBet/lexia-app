import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Case {
  id: string;
  case_number: string;
  title: string;
  client: string;
  /** Parte contrária/adversa do processo (a outra parte além do Cliente). */
  parte_diversa: string | null;
  type: string;
  status: string;
  /** Vara judicial responsável pelo processo. */
  vara: string | null;
  /** Comarca (jurisdição/localidade) do processo. */
  comarca: string | null;
  /** Valor da causa/processo, em reais. */
  valor_causa: number | null;
  /** Data de abertura/distribuição do processo no tribunal. */
  data_abertura_tribunal: string | null;
  /** Data de aceitação do processo. */
  data_aceitacao: string | null;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  /** true quando o processo já está registrado para rastreamento de publicações no JusBrasil. */
  jusbrasil_monitoring_active: boolean;
  jusbrasil_monitoring_started_at: string | null;
}

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado");
  return user;
}

export function useCases() {
  return useQuery({
    queryKey: ["cases"],
    queryFn: async () => {
      await requireUser();
      const { data, error } = await supabase.from("cases").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Case[];
    },
  });
}

// Não existe mais criação manual de processo pela interface (nem hook de
// client exposto para isso): por decisão de produto, todo processo na
// tabela "cases" passa a ser criado exclusivamente pelas integrações
// automáticas com o JusBrasil (webhook de publicações e busca ativa), que
// rodam com a service role nas edge functions e não passam pela RLS de
// INSERT abaixo — por isso a política "Users can create their own cases"
// foi removida do banco (ver migration
// 20260905030000_remove_manual_case_creation.sql): nem mesmo uma chamada
// direta à API do Supabase por um usuário autenticado consegue inserir um
// processo manualmente a partir de agora.

export function useUpdateCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Case> & { id: string }) => {
      await requireUser();
      const safeUpdates = { ...updates };
      delete (safeUpdates as Partial<Case>).id;
      delete (safeUpdates as Partial<Case>).user_id;
      const { data, error } = await supabase.from("cases").update(safeUpdates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Processo atualizado!");
    },
    onError: (error) => toast.error(error.message || "Erro ao atualizar processo"),
  });
}

export function useDeleteCase() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await requireUser();
      const { error } = await supabase.from("cases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success("Processo excluído!");
    },
    onError: (error) => toast.error(error.message || "Erro ao excluir processo"),
  });
}

type TrackProcessResult = { success: boolean; already_active?: boolean; message?: string };

async function invokeTrackCase(caseId: string): Promise<TrackProcessResult> {
  const { data, error } = await supabase.functions.invoke("jusbrasil-monitor-process", {
    body: { case_id: caseId },
  });
  if (error) {
    let message = (data as { error?: string } | null)?.error || error.message;
    const context = (error as { context?: Response }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json() as { error?: string; details?: unknown };
        if (payload?.error) message = payload.error;
      } catch { /* mantém a mensagem original */ }
    }
    throw new Error(message);
  }
  if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);
  return data as TrackProcessResult;
}

// Registra um processo já existente para rastreamento automático de
// publicações no JusBrasil (ver supabase/functions/jusbrasil-monitor-process).
export function useTrackCasePublications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: invokeTrackCase,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success(result.message || "Rastreamento de publicações ativado para este processo!");
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao ativar o rastreamento deste processo"),
  });
}


export interface TrackAllCasesResult {
  activated: number;
  alreadyActive: number;
  failed: Array<{ caseId: string; caseNumber: string; message: string }>;
  total: number;
}

// Ativação em lote é deliberadamente sequencial: evita rajadas de chamadas
// ao provedor e permite registrar exatamente quais processos falharam.
export function useTrackAllCasePublications() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cases: Array<Pick<Case, "id" | "case_number" | "jusbrasil_monitoring_active">>) => {
      const result: TrackAllCasesResult = {
        activated: 0,
        alreadyActive: cases.filter((item) => item.jusbrasil_monitoring_active).length,
        failed: [],
        total: cases.length,
      };

      for (const item of cases) {
        if (item.jusbrasil_monitoring_active) continue;
        try {
          const tracked = await invokeTrackCase(item.id);
          if (tracked.already_active) result.alreadyActive += 1;
          else result.activated += 1;
        } catch (error) {
          result.failed.push({
            caseId: item.id,
            caseNumber: item.case_number,
            message: error instanceof Error ? error.message : "Falha ao ativar rastreamento",
          });
        }
      }

      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      if (result.failed.length === 0) {
        toast.success(
          result.activated > 0
            ? `Rastreamento ativado para ${result.activated} processo(s).`
            : "Todos os processos já estavam sendo rastreados.",
        );
      } else {
        toast.warning(
          `${result.activated} ativado(s), ${result.alreadyActive} já ativo(s) e ${result.failed.length} com falha.`,
        );
      }
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao rastrear os processos"),
  });
}
