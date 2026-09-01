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
        })
        .select()
        .single();

      if (error) throw error;
      return data as Publication;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
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
      return data as Publication;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publications"] });
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
