import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  pollJusbrasilIntegration,
  type JusbrasilIntegration,
  type PollIntegrationResult,
} from "./pollJusbrasilIntegration.ts";
import { getJusbrasilApiToken } from "./jusbrasilToken.ts";

export type CentralJusbrasilIntegration = Omit<JusbrasilIntegration, "api_key">;

/**
 * Fachada oficial da LEXIA para chamadas ao JusBrasil.
 *
 * A credencial do provedor permanece centralizada no backend e nunca é
 * exposta ao tenant. Operações manuais e agendadas podem usar os recursos
 * configurados na integração (nome/razão social e OAB).
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
