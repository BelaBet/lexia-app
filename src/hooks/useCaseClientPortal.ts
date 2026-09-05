// Hooks usados pelo lado do ADVOGADO (painel interno) para gerenciar o
// Espaço do Cliente de um processo: convidar cliente, criar/traduzir itens da
// timeline, criar solicitações e ver documentos trocados.

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TimelineEvent, ClientRequest, ClientDocument } from "./useClientPortal";

export interface CaseClientLink {
  id: string; // case_clients.id
  client_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  invite_status: string;
  has_access: boolean;
}

export function useCaseClientsList(caseId: string | undefined) {
  return useQuery({
    queryKey: ["case-clients", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_clients")
        .select("id, client_id, clients(id, full_name, email, phone, invite_status, user_id)")
        .eq("case_id", caseId as string);
      if (error) throw error;
      return (data ?? []).map((row) => {
        const c = row.clients as unknown as {
          id: string; full_name: string; email: string; phone: string | null; invite_status: string; user_id: string | null;
        };
        return {
          id: row.id,
          client_id: row.client_id,
          full_name: c?.full_name ?? "",
          email: c?.email ?? "",
          phone: c?.phone ?? null,
          invite_status: c?.invite_status ?? "pending",
          has_access: Boolean(c?.user_id),
        } as CaseClientLink;
      });
    },
  });
}

export function useInviteClient(caseId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { full_name: string; email: string; phone?: string }) => {
      if (!caseId) throw new Error("Processo não informado");
      const response = await supabase.functions.invoke("invite-client", {
        body: { case_id: caseId, full_name: input.full_name, email: input.email, phone: input.phone },
      });
      if (response.error) {
        const message = (response.data as { error?: string } | null)?.error || response.error.message;
        throw new Error(message);
      }
      return response.data as { success: boolean; already_had_access: boolean };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-clients", caseId] });
    },
  });
}

export function useCaseTimelineManage(caseId: string | undefined) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["case-timeline-manage", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_timeline_events")
        .select("*")
        .eq("case_id", caseId as string)
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as TimelineEvent[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      title: string; client_summary: string; event_date: string; internal_note?: string; visible_to_client: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !caseId) throw new Error("Sessão inválida");
      const { error } = await supabase.from("case_timeline_events").insert({
        case_id: caseId,
        created_by: user.id,
        source: "manual",
        event_date: input.event_date,
        title: input.title,
        client_summary: input.client_summary,
        internal_note: input.internal_note || null,
        visible_to_client: input.visible_to_client,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-timeline-manage", caseId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "timeline", caseId] });
    },
  });

  return { listQuery, createMutation };
}

export async function translateForClient(caseId: string, rawText: string) {
  const response = await supabase.functions.invoke("humanize-timeline-event", {
    body: { case_id: caseId, raw_text: rawText },
  });
  if (response.error) {
    const message = (response.data as { error?: string } | null)?.error || response.error.message;
    throw new Error(message);
  }
  return response.data as { title: string; client_summary: string };
}

export function useCaseRequestsManage(caseId: string | undefined) {
  const queryClient = useQueryClient();

  const listQuery = useQuery({
    queryKey: ["case-requests-manage", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_requests")
        .select("*")
        .eq("case_id", caseId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientRequest[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: {
      type: "document" | "other" | "signature" | "questionnaire";
      title: string;
      description?: string;
      due_date?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !caseId) throw new Error("Sessão inválida");
      const { error } = await supabase.from("client_requests").insert({
        case_id: caseId,
        created_by: user.id,
        type: input.type,
        title: input.title,
        description: input.description || null,
        due_date: input.due_date || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-requests-manage", caseId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "requests", caseId] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (requestId: string) => {
      const { error } = await supabase.from("client_requests").update({ status: "cancelled" }).eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case-requests-manage", caseId] });
    },
  });

  return { listQuery, createMutation, cancelMutation };
}

export function useCaseDocumentsManage(caseId: string | undefined) {
  return useQuery({
    queryKey: ["case-documents-manage", caseId],
    enabled: Boolean(caseId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_documents")
        .select("*")
        .eq("case_id", caseId as string)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as ClientDocument[];
    },
  });
}
