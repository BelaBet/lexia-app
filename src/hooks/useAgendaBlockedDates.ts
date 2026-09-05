// "Bloqueios e Feriados" da Agenda — dias/períodos sem expediente forense
// usados para corrigir o prazo real de resposta quando ele chega via API
// (ver supabase/functions/_shared/businessDays.ts e a migration
// 20260905070000_agenda_bloqueios_feriados.sql). Feriados nacionais e o
// recesso forense (CPC art. 220) já vêm semeados como registros globais
// (user_id null, somente leitura aqui); esta tela deixa o escritório
// complementar com feriados estaduais/municipais da própria comarca ou
// bloqueios pontuais (greve, calamidade local).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type BlockedDateScope = "nacional" | "estadual" | "municipal" | "comarca" | "interno";

export interface AgendaBlockedDate {
  id: string;
  user_id: string | null;
  start_date: string;
  end_date: string;
  title: string;
  scope: BlockedDateScope;
  created_at: string;
}

export function useAgendaBlockedDates() {
  return useQuery({
    queryKey: ["agenda_blocked_dates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agenda_blocked_dates")
        .select("*")
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as AgendaBlockedDate[];
    },
  });
}

export interface CreateBlockedDateInput {
  title: string;
  start_date: string;
  end_date: string;
  scope: BlockedDateScope;
}

export function useCreateAgendaBlockedDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateBlockedDateInput) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão inválida");

      const { error } = await supabase.from("agenda_blocked_dates").insert({
        user_id: user.id,
        title: input.title,
        start_date: input.start_date,
        end_date: input.end_date,
        scope: input.scope,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda_blocked_dates"] });
      toast.success("Bloqueio adicionado");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao adicionar bloqueio");
    },
  });
}

export function useDeleteAgendaBlockedDate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("agenda_blocked_dates").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["agenda_blocked_dates"] });
      toast.success("Bloqueio removido");
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao remover bloqueio");
    },
  });
}
