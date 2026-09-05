import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface Document {
  id: string;
  title: string;
  type: string;
  content: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  user_id: string | null;
  /** Processo ao qual este documento pertence (opcional) — usado para a contagem de documentos por processo em Processos. */
  case_id: string | null;
}

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Usuário não autenticado");
  return user;
}

export function useDocuments() {
  return useQuery({
    queryKey: ["documents"],
    queryFn: async () => {
      await requireUser();
      const { data, error } = await supabase.from("documents").select("*").order("updated_at", { ascending: false });
      if (error) throw error;
      return data as Document[];
    },
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (doc: { title: string; type: string; content?: string; status?: string; case_id?: string | null }) => {
      const user = await requireUser();
      const title = doc.title.trim();
      if (!title) throw new Error("O título do documento é obrigatório");
      const { data, error } = await supabase.from("documents").insert({
        title,
        type: doc.type,
        content: doc.content || null,
        status: doc.status || "draft",
        user_id: user.id,
        case_id: doc.case_id || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Documento criado com sucesso!");
    },
    onError: (error) => toast.error(error.message || "Erro ao criar documento"),
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Document> & { id: string }) => {
      await requireUser();
      const safeUpdates = { ...updates };
      delete (safeUpdates as Partial<Document>).id;
      delete (safeUpdates as Partial<Document>).user_id;
      const { data, error } = await supabase.from("documents").update(safeUpdates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success("Documento salvo!");
    },
    onError: (error) => toast.error(error.message || "Erro ao salvar documento"),
  });
}
