// Busca ativa periódica no JusBrasil (Consulta Processual), complementando
// o webhook (publication-webhook). Pensada para ser chamada por um job
// agendado (pg_cron + pg_net) uma vez por dia — veja
// supabase/scripts/agendar_busca_ativa_jusbrasil.sql para o agendamento.
//
// Para cada integração ativa da fonte "jusbrasil" que tenha uma api_key e
// pelo menos um identificador de busca (monitor_name = nome/razão social, ou
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

  // Esta função processa TODAS as integrações JusBrasil de TODAS as contas
  // de uma vez (é o job agendado — veja
  // supabase/scripts/agendar_busca_ativa_jusbrasil.sql). O `verify_jwt` do
  // Supabase só garante que o token é válido, não que é o cron chamando —
  // qualquer usuário autenticado da aplicação também tem um JWT válido. Por
  // isso, além do verify_jwt, exige explicitamente que o Authorization seja
  // exatamente a Service Role Key (é o que o agendamento envia), recusando
  // qualquer chamada feita com o token comum de um usuário — do contrário,
  // um usuário logado poderia disparar essa rota e ver, na resposta,
  // user_id e status de busca de OUTRAS contas/empresas.
  const authHeader = req.headers.get("Authorization") || "";
  const providedToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (providedToken !== serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 403 });
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: integrations, error: integrationsError } = await adminClient
    .from("publication_integrations")
    .select("id, user_id, api_key, monitor_name, monitor_oab, jusbrasil_report_id, price_per_search")
    .eq("source", "jusbrasil")
    .eq("is_active", true)
    .not("api_key", "is", null);

  if (integrationsError) {
    console.error("Error loading integrations:", integrationsError);
    return new Response(JSON.stringify({ error: "Erro ao carregar integrações" }), { status: 500 });
  }

  let processed = 0;
  let imported = 0;
  let failed = 0;

  for (const integration of integrations || []) {
    if (!integration.api_key || (!integration.monitor_name && !integration.monitor_oab)) continue;

    const result = await pollJusbrasilIntegration(adminClient, integration, "poll");
    processed += 1;
    imported += result.imported;
    if (result.error) failed += 1;
  }

  // A resposta só traz contagens agregadas — nunca a lista de user_id por
  // conta — já que quem chama essa rota (o agendamento) não precisa (nem
  // deve) ver dados de qual empresa é qual.
  return new Response(JSON.stringify({ success: true, processed, imported, failed }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
