// Busca ativa periódica no JusBrasil (Consulta Processual), complementando
// o webhook (publication-webhook). Pensada para ser chamada por um job
// agendado (pg_cron + pg_net) uma vez por dia — veja
// supabase/scripts/agendar_busca_ativa_jusbrasil.sql para o agendamento.
//
// IMPORTANTE (white-label): a credencial do provedor JusBrasil é central da
// plataforma. Esta função não recebe, lê nem persiste api_key por tenant.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { pollJusbrasilCentral } from "../_shared/pollJusbrasilCentral.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), { status: 500 });
  }

  const authHeader = req.headers.get("Authorization") || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (providedToken !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

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

    const result = await pollJusbrasilCentral(adminClient, integration, "poll");
    processed += 1;
    imported += result.imported;
    if (result.error) failed += 1;
  }

  return new Response(JSON.stringify({ success: true, processed, imported, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
