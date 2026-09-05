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
