// Busca ativa periódica no JusBrasil (Consulta Processual), complementando
// o webhook (publication-webhook). Pensada para ser chamada por um job
// agendado (pg_cron + pg_net) uma vez por dia — veja
// supabase/scripts/agendar_busca_ativa_jusbrasil.sql para o agendamento.
//
// IMPORTANTE (white-label): a credencial do provedor JusBrasil é central da
// plataforma. Ela é resolvida pelo backend (Edge Secret ou Vault) e nunca é
// lida da tabela publication_integrations.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { pollJusbrasilIntegration } from "../_shared/pollJusbrasilIntegration.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), { status: 500 });
  }

  // Esta função processa TODAS as integrações JusBrasil de TODAS as contas
  // de uma vez (é o job agendado). Exige explicitamente a Service Role Key,
  // impedindo que um usuário autenticado comum dispare a rotina global.
  const authHeader = req.headers.get("Authorization") || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (providedToken !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  let jusbrasilApiToken: string;
  try {
    jusbrasilApiToken = await getJusbrasilApiToken(adminClient);
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: "Integração JusBrasil não configurada" }), { status: 500 });
  }

  const { data: integrations, error: integrationsError } = await adminClient
    .from("publication_integrations")
    .select("id, user_id, monitor_name, monitor_oab, jusbrasil_report_id, price_per_search, linked_client_id")
    .eq("source", "jusbrasil")
    .eq("is_active", true);

  if (integrationsError) {
    console.error("Error loading integrations:", integrationsError);
    return new Response(JSON.stringify({ error: "Erro ao carregar integrações" }), { status: 500 });
  }

  let processed = 0;
  let imported = 0;
  let failed = 0;

  for (const integration of integrations || []) {
    if (!integration.monitor_name && !integration.monitor_oab) continue;

    // Compatibilidade interna temporária: o helper compartilhado ainda
    // tipa a credencial como api_key, mas ela nasce sempre do token central
    // e nunca da empresa/tenant.
    const result = await pollJusbrasilIntegration(
      adminClient,
      { ...integration, api_key: jusbrasilApiToken },
      "poll",
    );
    processed += 1;
    imported += result.imported;
    if (result.error) failed += 1;
  }

  return new Response(JSON.stringify({ success: true, processed, imported, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
