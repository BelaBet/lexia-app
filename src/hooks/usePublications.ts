import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type PublicationSource = "manual" | "jusbrasil" | "escavador" | "webjur" | "outro";
export type PublicationStatus = "pending" | "in_progress" | "completed" | "overdue" | "cancelled";
export type PublicationResponsibleRole = "advogado" | "operacional";

export interface PublicationFollowup {
  id: string;
  publication_id: string;
  user_id: string;
  note: string;
  created_at: string;
}

export interface Publication {
  id: string;
  user_id: string;
  case_id: string | null;
  process_number: string | null;
  source: PublicationSource;
  content: string;
  published_date: string;
  external_deadline: string | null;
  external_responsible_name: string | null;
  external_responsible_role: PublicationResponsibleRole | null;
  internal_deadline: string | null;
  internal_responsible_name: string | null;
  internal_responsible_role: PublicationResponsibleRole | null;
  tese: string | null;
  status: PublicationStatus;
  imported_automatically: boolean;
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
  followups?: PublicationFollowup[];
}

export interface CreatePublicationData {
  case_id?: string | null;
  process_number?: string;
  source?: PublicationSource;
  content: string;
  published_date: string;
  external_deadline?: string;
  external_responsible_name?: string;
  external_responsible_role?: PublicationResponsibleRole;
  internal_deadline?: string;
  internal_responsible_name?: string;
  internal_responsible_role?: PublicationResponsibleRole;
  tese?: string;
  status?: PublicationStatus;
  vara?: string | null;
  comarca?: string | null;
  valor_causa?: number | null;
  data_abertura_tribunal?: string | null;
  data_aceitacao?: string | null;
}

export type UpdatePublicationData = Partial<CreatePublicationData> & { id: string };

export function usePublications(filters?: { status?: PublicationStatus | "all" }) {
  return useQuery({
    queryKey: ["publications", filters],
    queryFn: async () => {
      let query = supabase
        .from("publications")
        .select("*")
        .order("external_deadline", { ascending: true, nullsFirst: false });

      if (filters?.status && filters.status !== "all") {
        query = query.eq("status", filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Publication[];
    },
  });
}

export function usePublicationFollowups(publicationId: string | null) {
  return useQuery({
    queryKey: ["publication_followups", publicationId],
    enabled: !!publicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publication_followups")
        .select("*")
        .eq("publication_id", publicationId as string)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as PublicationFollowup[];
    },
  });
}

export interface PublicationAttachment {
  id: string;
  publication_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  source: "manual" | "api";
  created_at: string;
}

// Cria/atualiza na Agenda os eventos correspondentes aos prazos externo e
// interno da publicação, para que eles apareçam automaticamente lá (além de
// em Publicações), sem depender de lançamento manual. Cada prazo vira um
// evento próprio (identificado por publication_id + type), reaproveitado se
// já existir; se o prazo for removido, o evento correspondente é apagado.
async function syncPublicationDeadlineEvents(
  userId: string,
  publication: Pick<
    Publication,
    "id" | "case_id" | "process_number" | "content" | "external_deadline" | "internal_deadline"
  >,
) {
  const deadlines: Array<{ type: string; date: string | null; label: string; priority: "high" | "medium" }> = [
    { type: "prazo_externo", date: publication.external_deadline, label: "Prazo externo", priority: "high" },
    { type: "prazo_interno", date: publication.internal_deadline, label: "Prazo interno", priority: "medium" },
  ];

  const identifier = publication.process_number || publication.content.slice(0, 60);

  for (const deadline of deadlines) {
    const { data: existing } = await supabase
      .from("events")
      .select("id")
      .eq("publication_id", publication.id)
      .eq("type", deadline.type)
      .maybeSingle();

    if (!deadline.date) {
      // Prazo removido/limpo: remove o evento correspondente, se houver.
      if (existing) {
        await supabase.from("events").delete().eq("id", existing.id);
      }
      continue;
    }

    if (existing) {
      await supabase.from("events").update({ event_date: deadline.date }).eq("id", existing.id);
    } else {
      await supabase.from("events").insert({
        user_id: userId,
        title: `${deadline.label}: ${identifier}`,
        description: publication.content.slice(0, 500),
        event_date: deadline.date,
        event_time: "09:00:00",
        type: deadline.type,
        case_id: publication.case_id,
        publication_id: publication.id,
        status: "pending",
        priority: deadline.priority,
        notification_enabled: true,
        notification_minutes_before: 60 * 24,
      });
    }
  }
}

export function useCreatePublication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreatePublicationData) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("publications")
        .insert({
          user_id: user.id,
          case_id: input.case_id || null,
          process_number: input.process_number || null,
          source: input.source || "manual",
          content: input.content,
          published_date: input.published_date,
          external_deadline: input.external_deadline || null,
          external_responsible_name: input.external_responsible_name || null,
          external_responsible_role: input.external_responsible_role || null,
          internal_deadline: input.internal_deadline || null,
          internal_responsible_name: input.internal_responsible_name || null,
          internal_responsible_role: input.internal_responsible_role || null,
          tese: input.tese || null,
          status: input.status || "pending",
          vara: input.vara || null,
          comarca: input.comarca || null,
          valor_causa: input.valor_causa ?? null,
          data_abertura_tribunal: input.data_abertura_tribunal || null,
          data_aceitacao: input.data_aceitacao || null,
        })
        .select()
        .single();

      if (error) throw error;

      const publication = data as Publication;
      await syncPublicationDeadlineEvents(user.id, publication);

      return publication;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Publicação cadastrada com sucesso!");
    },
    onError: (error) => {
      console.error("Error creating publication:", error);
      toast.error("Erro ao cadastrar publicação");
    },
  });
}

export function useUpdatePublication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdatePublicationData) => {
      const { data, error } = await supabase
        .from("publications")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;

      const publication = data as Publication;
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await syncPublicationDeadlineEvents(user.id, publication);

      return publication;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Publicação atualizada!");
    },
    onError: (error) => {
      console.error("Error updating publication:", error);
      toast.error("Erro ao atualizar publicação");
    },
  });
}

export function useDeletePublication() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("publications").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
      toast.success("Publicação excluída!");
    },
    onError: (error) => {
      console.error("Error deleting publication:", error);
      toast.error("Erro ao excluir publicação");
    },
  });
}

export function useAddPublicationFollowup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ publicationId, note }: { publicationId: string; note: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("publication_followups")
        .insert({ publication_id: publicationId, user_id: user.id, note })
        .select()
        .single();

      if (error) throw error;
      return data as PublicationFollowup;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["publication_followups", variables.publicationId] });
      toast.success("Followup adicionado!");
    },
    onError: (error) => {
      console.error("Error adding followup:", error);
      toast.error("Erro ao adicionar followup");
    },
  });
}

export function useDeletePublicationFollowup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id }: { id: string; publicationId: string }) => {
      const { error } = await supabase.from("publication_followups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["publication_followups", variables.publicationId] });
    },
    onError: (error) => {
      console.error("Error deleting followup:", error);
      toast.error("Erro ao remover followup");
    },
  });
}

export function usePublicationAttachments(publicationId: string | null) {
  return useQuery({
    queryKey: ["publication_attachments", publicationId],
    enabled: !!publicationId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("publication_attachments")
        .select("*")
        .eq("publication_id", publicationId as string)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as PublicationAttachment[];
    },
  });
}

export function useUploadPublicationAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ publicationId, file }: { publicationId: string; file: File }) => {
      const filePath = `${publicationId}/${Date.now()}_${file.name}`;

      const { error: uploadError } = await supabase.storage
        .from("publication-attachments")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from("publication_attachments")
        .insert({
          publication_id: publicationId,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
          file_type: file.type,
          source: "manual",
        })
        .select()
        .single();

      if (error) throw error;
      return data as PublicationAttachment;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["publication_attachments", variables.publicationId] });
      toast.success("Documento anexado!");
    },
    onError: (error) => {
      console.error("Error uploading publication attachment:", error);
      toast.error("Erro ao anexar documento");
    },
  });
}

export function useDeletePublicationAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, filePath }: { id: string; publicationId: string; filePath: string }) => {
      await supabase.storage.from("publication-attachments").remove([filePath]);
      const { error } = await supabase.from("publication_attachments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["publication_attachments", variables.publicationId] });
      toast.success("Documento removido!");
    },
    onError: (error) => {
      console.error("Error deleting publication attachment:", error);
      toast.error("Erro ao remover documento");
    },
  });
}

export async function getPublicationAttachmentUrl(filePath: string) {
  const { data, error } = await supabase.storage
    .from("publication-attachments")
    .createSignedUrl(filePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}
