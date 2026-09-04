// Busca ativa periódica no JusBrasil (Consulta Processual), complementando
// o webhook (publication-webhook). Pensada para ser chamada por um job
// agendado (pg_cron + pg_net) uma vez por dia — veja
// supabase/scripts/agendar_busca_ativa_jusbrasil.sql para o agendamento.
//
// Para cada integração ativa da fonte "jusbrasil" que tenha uma api_key e
// pelo menos um identificador de busca (monitor_document = CPF/CNPJ, ou
// monitor_oab = número da OAB), esta função consulta o JusBrasil por
// processos/movimentações novas e importa cada novidade como uma publicação
// (mesma lógica de deduplicação e notificação do webhook), além de registrar
// o uso no contador financeiro de pesquisas processuais.
//
// A lógica de busca/importação para uma única integração vive em
// _shared/pollJusbrasilIntegration.ts, compartilhada com a função
// manual-process-search (busca sob demanda disparada pelo usuário).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { pollJusbrasilIntegration } from "../_shared/pollJusbrasilIntegration.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Configuração do Supabase ausente" }), { status: 500 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: integrations, error: integrationsError } = await adminClient
    .from("publication_integrations")
    .select("id, user_id, api_key, monitor_document, monitor_oab, price_per_search")
    .eq("source", "jusbrasil")
    .eq("is_active", true)
    .not("api_key", "is", null);

  if (integrationsError) {
    console.error("Error loading integrations:", integrationsError);
    return new Response(JSON.stringify({ error: "Erro ao carregar integrações" }), { status: 500 });
  }

  const results: Array<{ user_id: string; imported: number; error?: string }> = [];

  for (const integration of integrations || []) {
    if (!integration.api_key || (!integration.monitor_document && !integration.monitor_oab)) continue;

    const result = await pollJusbrasilIntegration(adminClient, integration, "poll");
    results.push({ user_id: integration.user_id, imported: result.imported, error: result.error });
  }

  return new Response(JSON.stringify({ success: true, results }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
