import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

/**
 * Resolve a credencial central do JusBrasil sem depender de api_key por tenant.
 *
 * Ordem:
 * 1. Secret de Edge Function (JUSBRASIL_API_TOKEN), quando configurado.
 * 2. Supabase Vault via RPC restrita ao service_role.
 *
 * Isso permite que a plataforma white-label use uma única credencial do
 * provedor sem expor ou duplicar o token em publication_integrations.
 */
export async function getJusbrasilApiToken(adminClient: SupabaseClient): Promise<string> {
  const envToken = Deno.env.get("JUSBRASIL_API_TOKEN")?.trim();
  if (envToken) return envToken;

  const { data, error } = await adminClient.rpc("get_jusbrasil_api_token");
  if (error) {
    console.error("Erro ao resolver JUSBRASIL_API_TOKEN pelo Vault:", error.message);
    throw new Error("Integração JusBrasil não configurada no backend");
  }

  const vaultToken = typeof data === "string" ? data.trim() : "";
  if (!vaultToken) {
    throw new Error("JUSBRASIL_API_TOKEN não encontrado no backend");
  }

  return vaultToken;
}
