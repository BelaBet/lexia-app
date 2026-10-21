import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CaseCollaboratorRow {
  id: string;
  case_id: string;
  collaborator_user_id: string;
  created_at: string;
  case: { id: string; case_number: string; title: string; client: string; type: string } | null;
  collaborator_full_name: string | null;
}

// Lista os colaboradores dos processos de quem chama, já com o título do
// processo e o nome do colaborador para exibição — RLS garante que só
// aparecem linhas de processos dos quais o chamador é o dono.
export function useCaseCollaborators() {
  return useQuery({
    queryKey: ["case_collaborators"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("case_collaborators")
        .select("id, case_id, collaborator_user_id, created_at, cases(id, case_number, title, client, type)")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const collaboratorIds = [...new Set(rows.map((r) => r.collaborator_user_id as string))];
      const namesByUserId = new Map<string, string | null>();
      if (collaboratorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("user_id, full_name")
          .in("user_id", collaboratorIds);
        for (const p of profiles ?? []) namesByUserId.set(p.user_id as string, p.full_name as string | null);
      }

      return rows.map((r) => ({
        id: r.id,
        case_id: r.case_id,
        collaborator_user_id: r.collaborator_user_id,
        created_at: r.created_at,
        case: r.cases ?? null,
        collaborator_full_name: namesByUserId.get(r.collaborator_user_id as string) ?? null,
      })) as CaseCollaboratorRow[];
    },
  });
}

export interface InviteCollaboratorInput {
  full_name: string;
  cpf?: string | null;
  email: string;
  case_ids: string[];
  /** Opcional: quando informada, a conta já nasce pronta pra uso com essa senha (o colaborador troca depois em Configurações), em vez de depender do e-mail de convite. */
  password?: string;
}

interface InviteCollaboratorResult {
  success: boolean;
  collaborator_user_id: string;
  already_existed: boolean;
  password_set: boolean;
  assigned_count: number;
}

export function useInviteCollaborator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteCollaboratorInput) => {
      const { data, error } = await supabase.functions.invoke("invite-collaborator", { body: input });
      if (error) {
        const message = (data as { error?: string } | null)?.error || error.message;
        throw new Error(message);
      }
      if ((data as { error?: string } | null)?.error) throw new Error((data as { error?: string }).error);
      return data as InviteCollaboratorResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["case_collaborators"] });
      toast.success(
        result.already_existed
          ? `Acesso concedido a ${result.assigned_count} processo(s).`
          : result.password_set
            ? `Conta criada com a senha definida! Acesso concedido a ${result.assigned_count} processo(s).`
            : `Convite enviado! Acesso concedido a ${result.assigned_count} processo(s).`,
      );
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao convidar colaborador"),
  });
}

// Remove o acesso de um colaborador a UM processo específico (não exclui a
// conta dele, só este vínculo) — RLS só permite ao dono do processo.
export function useRemoveCaseCollaborator() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("case_collaborators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["case_collaborators"] });
      toast.success("Acesso removido");
    },
    onError: (error: Error) => toast.error(error.message || "Erro ao remover acesso"),
  });
}
