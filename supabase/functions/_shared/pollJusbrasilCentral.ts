import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  pollJusbrasilIntegration,
  type JusbrasilIntegration,
  type PollIntegrationResult,
} from "./pollJusbrasilIntegration.ts";
import { getJusbrasilApiToken } from "./jusbrasilToken.ts";

export type CentralJusbrasilIntegration = Omit<JusbrasilIntegration, "api_key">;

/**
 * Fachada oficial da Lex IA para chamadas de busca JusBrasil.
 *
 * Código de tenant/usuário não recebe, não lê e não persiste a credencial do
 * provedor. O detalhe legado `api_key` fica encapsulado aqui até a remoção
 * física desse campo do helper antigo e do schema.
 */
export async function pollJusbrasilCentral(
  adminClient: SupabaseClient,
  integration: CentralJusbrasilIntegration,
  searchType: "manual" | "poll",
): Promise<PollIntegrationResult> {
  const token = await getJusbrasilApiToken(adminClient);
  return pollJusbrasilIntegration(
    adminClient,
    { ...integration, api_key: token },
    searchType,
  );
}
