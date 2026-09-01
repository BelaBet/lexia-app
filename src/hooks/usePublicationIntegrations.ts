import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type WebhookSource = "jusbrasil" | "webjur" | "escavador";

export interface PublicationIntegration {
  id: string;
  user_id: string;
  source: WebhookSource;
  webhook_secret: string;
  api_key: string | null;
  monitor_document: string | null;
  monitor_oab: string | null;
  last_poll_status: string | null;
  last_poll_error: string | null;
  is_active: boolean;
  last_received_at: string | null;
  created_at: string;
  updated_at: string;
}

export function usePublicationIntegrations() {
  return useQuery({
    queryKey: ["publication_integrations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("publication_integrations").select("*");
      if (error) throw error;
      return (data || []) as PublicationIntegration[];
    },
  });
}

export function useCreatePublicationIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (source: WebhookSource) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      const { data, error } = await supabase
        .from("publication_integrations")
        .insert({ user_id: user.id, source })
        .select()
        .single();

      if (error) throw error;
      return data as PublicationIntegration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publication_integrations"] });
      toast.success("Integração criada! Copie a URL e o segredo para configurar no provedor.");
    },
    onError: (error) => {
      console.error("Error creating publication integration:", error);
      toast.error("Erro ao criar integração");
    },
  });
}

export function useRegeneratePublicationIntegrationSecret() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Gera um novo segredo aleatório no client (hex de 48 caracteres) e
      // grava — o antigo passa a ser inválido imediatamente.
      const bytes = new Uint8Array(24);
      crypto.getRandomValues(bytes);
      const newSecret = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");

      const { data, error } = await supabase
        .from("publication_integrations")
        .update({ webhook_secret: newSecret })
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as PublicationIntegration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publication_integrations"] });
      toast.success("Novo segredo gerado! Atualize o webhook no provedor.");
    },
    onError: (error) => {
      console.error("Error regenerating webhook secret:", error);
      toast.error("Erro ao gerar novo segredo");
    },
  });
}

export function useTogglePublicationIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("publication_integrations").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publication_integrations"] });
    },
    onError: (error) => {
      console.error("Error toggling publication integration:", error);
      toast.error("Erro ao atualizar integração");
    },
  });
}

export interface UpdatePublicationIntegrationInput {
  id: string;
  api_key?: string | null;
  monitor_document?: string | null;
  monitor_oab?: string | null;
}

export function useUpdatePublicationIntegrationConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: UpdatePublicationIntegrationInput) => {
      const { data, error } = await supabase
        .from("publication_integrations")
        .update(updates)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data as PublicationIntegration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publication_integrations"] });
      toast.success("Configuração salva!");
    },
    onError: (error) => {
      console.error("Error updating publication integration config:", error);
      toast.error("Erro ao salvar configuração");
    },
  });
}

export function useDeletePublicationIntegration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("publication_integrations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["publication_integrations"] });
      toast.success("Integração removida");
    },
    onError: (error) => {
      console.error("Error deleting publication integration:", error);
      toast.error("Erro ao remover integração");
    },
  });
}
