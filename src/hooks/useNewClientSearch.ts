// Fluxo "Novo Cliente": ao contrário do fluxo antigo (configurar uma busca
// em Integrações e esperar o processo aparecer sozinho para só então
// convidar o cliente), aqui o advogado cadastra o cliente primeiro — e o
// sistema já dispara a busca do processo dele no JusBrasil por nome, na
// hora, reaproveitando a chave de API já salva (não pede de novo a cada
// cliente).
//
// Passos (ver também supabase/functions/_shared/pollJusbrasilIntegration.ts
// e a migration 20260905040000_link_client_to_jusbrasil_search.sql):
//   1. Cria o cliente (public.clients).
//   2. Cria uma integração JusBrasil (monitor_name = nome do cliente) já
//      vinculada a esse cliente via linked_client_id — assim, qualquer
//      processo que essa integração encontrar (agora ou numa busca futura,
//      já que a consulta por nome é assíncrona e pode levar até 72h) fica
//      automaticamente ligado a este cliente.
//   3. Dispara a busca agora (manual-process-search).
//   4. Envia o convite de acesso ao "Meu Jurídico" por e-mail (invite-client
//      sem case_id — o vínculo com o processo, quando existir, já foi
//      resolvido no passo 2/3).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface NewClientSearchInput {
  full_name: string;
  email: string;
  phone?: string;
  api_key?: string; // se vazio, tenta reaproveitar a chave de uma integração JusBrasil já existente
}

export interface NewClientSearchResult {
  client_id: string;
  integration_id: string;
  imported: number;
  search_error?: string;
}

// Chave de API JusBrasil já salva em alguma integração existente da conta
// (evita pedir pra colar a mesma chave de novo a cada cliente novo).
async function findExistingApiKey(): Promise<string | null> {
  const { data, error } = await supabase
    .from("publication_integrations")
    .select("api_key")
    .eq("source", "jusbrasil")
    .not("api_key", "is", null)
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data?.api_key ?? null;
}

export function useCreateClientWithSearch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: NewClientSearchInput): Promise<NewClientSearchResult> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão inválida");

      const apiKey = input.api_key?.trim() || (await findExistingApiKey());
      if (!apiKey) {
        throw new Error("Informe a chave de API do JusBrasil (ainda não há nenhuma salva nesta conta).");
      }

      // 1) Cliente
      const { data: client, error: clientError } = await supabase
        .from("clients")
        .insert({
          owner_id: user.id,
          full_name: input.full_name,
          email: input.email,
          phone: input.phone || null,
          invite_status: "pending",
        })
        .select("id")
        .single();
      if (clientError || !client) throw new Error(clientError?.message || "Erro ao cadastrar o cliente");

      // 2) Integração JusBrasil já vinculada a esse cliente
      const { data: integration, error: integrationError } = await supabase
        .from("publication_integrations")
        .insert({
          user_id: user.id,
          source: "jusbrasil",
          api_key: apiKey,
          monitor_name: input.full_name,
          linked_client_id: client.id,
        })
        .select("id")
        .single();
      if (integrationError || !integration) {
        throw new Error(integrationError?.message || "Erro ao configurar a busca do processo");
      }

      // 3) Busca agora (best-effort: se falhar, o cliente e a integração já
      // foram criados — a busca diária agendada tenta de novo sozinha).
      let imported = 0;
      let searchError: string | undefined;
      const { data: searchData, error: searchInvokeError } = await supabase.functions.invoke("manual-process-search", {
        body: { integration_id: integration.id },
      });
      if (searchInvokeError) {
        searchError = searchInvokeError.message;
      } else if (searchData?.error) {
        searchError = searchData.error as string;
      } else {
        imported = (searchData as { imported?: number })?.imported ?? 0;
      }

      // 4) Convite de acesso ao Meu Jurídico (sem processo ainda — o vínculo
      // já está garantido pelo linked_client_id, ver passo 2).
      const { error: inviteInvokeError, data: inviteData } = await supabase.functions.invoke("invite-client", {
        body: { full_name: input.full_name, email: input.email, phone: input.phone },
      });
      if (inviteInvokeError) {
        throw new Error((inviteData as { error?: string } | null)?.error || inviteInvokeError.message);
      }
      if ((inviteData as { error?: string } | null)?.error) {
        throw new Error((inviteData as { error?: string }).error);
      }

      return { client_id: client.id, integration_id: integration.id, imported, search_error: searchError };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["publication_integrations"] });
      queryClient.invalidateQueries({ queryKey: ["case-clients"] });
    },
    onError: (error: Error) => {
      console.error("Error in new-client search flow:", error);
      toast.error(error.message || "Erro ao cadastrar cliente e buscar processo");
    },
  });
}
