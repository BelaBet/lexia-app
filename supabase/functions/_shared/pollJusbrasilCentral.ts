import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import {
  pollJusbrasilIntegration,
  type JusbrasilIntegration,
  type PollIntegrationResult,
} from "./pollJusbrasilIntegration.ts";
import { getJusbrasilApiToken } from "./jusbrasilToken.ts";

export type CentralJusbrasilIntegration = Omit<JusbrasilIntegration, "api_key">;

/**
 * Fachada oficial da Lex IA para chamadas ao JusBrasil.
 *
 * Regras de segurança financeira:
 * - credencial é sempre central, nunca por tenant;
 * - poll agendado nunca cria relatório pago por nome;
 * - poll agendado nunca cadastra/ativa monitoramento de OAB;
 * - somente uma ação manual explícita pode iniciar essas operações.
 */
export async function pollJusbrasilCentral(
  adminClient: SupabaseClient,
  integration: CentralJusbrasilIntegration,
  searchType: "manual" | "poll",
): Promise<PollIntegrationResult> {
  if (searchType === "poll") {
    // Sem relatório já existente, a busca por nome exigiria criação e
    // bill_start_update. O agendamento não pode iniciar cobrança sozinho.
    if (integration.monitor_name && !integration.jusbrasil_report_id) {
      return { imported: 0 };
    }

    // O helper legado registra OAB antes de consultar vínculos. Cadastro de
    // OAB é uma ação deliberada e não deve acontecer num cron. No poll,
    // removemos OAB do payload e, se não restar busca por nome já iniciada,
    // encerramos sem tocar o provedor.
    const safePollIntegration: CentralJusbrasilIntegration = {
      ...integration,
      monitor_oab: null,
    };

    if (!safePollIntegration.monitor_name) {
      return { imported: 0 };
    }

    const token = await getJusbrasilApiToken(adminClient);
    return pollJusbrasilIntegration(
      adminClient,
      { ...safePollIntegration, api_key: token },
      "poll",
    );
  }

  // Busca manual: o usuário tomou uma ação explícita. A credencial continua
  // centralizada e nunca é exposta/persistida no tenant.
  const token = await getJusbrasilApiToken(adminClient);
  return pollJusbrasilIntegration(
    adminClient,
    { ...integration, api_key: token },
    "manual",
  );
}
