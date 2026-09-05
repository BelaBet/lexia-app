// Hooks usados pelo lado do CLIENTE dentro do "Meu Jurídico" (/portal/*).
// Toda leitura aqui já é filtrada pelas políticas de RLS do banco (o
// cliente só enxerga o que está vinculado à sua própria conta).

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PortalClient {
  id: string;
  owner_id: string;
  user_id: string | null;
  full_name: string;
  email: string;
  phone: string | null;
}

export interface PortalCase {
  id: string;
  case_number: string | null;
  title: string;
  client: string;
  type: string;
  status: string;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  event_date: string;
  title: string;
  client_summary: string;
  source: string;
  visible_to_client: boolean;
  created_at: string;
}

export interface ClientRequest {
  id: string;
  case_id: string;
  type: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: string;
  fulfilled_at: string | null;
  created_at: string;
}

export interface ClientDocument {
  id: string;
  case_id: string;
  uploaded_by: "client" | "lawyer";
  category: string | null;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  status: string;
  created_at: string;
  request_id: string | null;
}

export interface PortalOutletContext {
  caseId: string;
  caseInfo?: PortalCase;
}

// Registro do próprio cliente logado (a linha em `clients` com user_id = eu).
export function useMyClientRecord() {
  return useQuery({
    queryKey: ["portal", "me"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data as PortalClient | null;
    },
  });
}

// Todos os processos vinculados a esse cliente ("Meus processos").
export function useMyCases() {
  return useQuery({
    queryKey: ["portal", "cases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_clients")
        .select("case_id, cases(id, case_number, title, client, type, status, created_at)");
      if (error) throw error;
      return (data ?? [])
        .map((row) => row.cases)
        .filter(Boolean) as unknown as PortalCase[];
    },
  });
}

export function useCaseTimeline(caseId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "timeline", caseId],
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
}

export function useCaseRequests(caseId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "requests", caseId],
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
}

export function useCaseDocuments(caseId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "documents", caseId],
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

// Cliente marca uma solicitação como cumprida (sem anexar documento — ex:
// assinatura feita fora do sistema, questionário respondido pessoalmente).
export function useFulfillRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, caseId }: { requestId: string; caseId: string }) => {
      const { error } = await supabase
        .from("client_requests")
        .update({ status: "fulfilled", fulfilled_at: new Date().toISOString() })
        .eq("id", requestId);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "requests", variables.caseId] });
    },
  });
}

// Upload de um documento — usado tanto pelo cliente (portal) quanto,
// reaproveitado, pelo advogado no painel interno.
export function useUploadClientDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      caseId,
      file,
      uploadedBy,
      category,
      requestId,
    }: {
      caseId: string;
      file: File;
      uploadedBy: "client" | "lawyer";
      category?: string;
      requestId?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão inválida");

      const safeName = file.name.replace(/[^\w.-]+/g, "_");
      const path = `${caseId}/${crypto.randomUUID()}-${safeName}`;

      const { error: uploadError } = await supabase.storage.from("client-documents").upload(path, file);
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase.from("client_documents").insert({
        case_id: caseId,
        uploaded_by_user_id: user.id,
        uploaded_by: uploadedBy,
        category: category ?? null,
        file_name: file.name,
        file_path: path,
        file_size: file.size,
        file_type: file.type || null,
        request_id: requestId ?? null,
      });
      if (insertError) throw insertError;

      if (requestId) {
        await supabase
          .from("client_requests")
          .update({ status: "fulfilled", fulfilled_at: new Date().toISOString() })
          .eq("id", requestId);
      }
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["portal", "documents", variables.caseId] });
      queryClient.invalidateQueries({ queryKey: ["portal", "requests", variables.caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-documents-manage", variables.caseId] });
      queryClient.invalidateQueries({ queryKey: ["case-requests-manage", variables.caseId] });
    },
  });
}

export async function getClientDocumentDownloadUrl(path: string) {
  const { data, error } = await supabase.storage.from("client-documents").createSignedUrl(path, 60 * 5);
  if (error) throw error;
  return data.signedUrl;
}
