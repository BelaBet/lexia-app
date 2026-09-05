// Dispara uma busca ativa avulsa (sob demanda) no JusBrasil para UMA
// integração específica — usado pelo botão "Buscar agora" na tela de
// Integrações. Faz a mesma coisa que a busca ativa diária agendada
// (poll-jusbrasil), mas para uma única integração e imediatamente, e marca
// o registro do contador financeiro com search_type = "manual" em vez de
// "poll" (a lógica em si vive em _shared/pollJusbrasilIntegration.ts,
// compartilhada entre as duas funções).
//
// Exige o usuário autenticado (JWT) e valida que a integração pertence a
// ele antes de rodar a busca.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { pollJusbrasilIntegration } from "../_shared/pollJusbrasilIntegration.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { integration_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const integrationId = body.integration_id;
  if (!integrationId) return json({ error: "integration_id é obrigatório" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Confere que a integração pertence ao usuário autenticado antes de
  // rodar qualquer busca em nome dele.
  const { data: integration, error: integrationError } = await adminClient
    .from("publication_integrations")
    .select("id, user_id, source, api_key, monitor_name, monitor_oab, jusbrasil_report_id, price_per_search")
    .eq("id", integrationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (integrationError) {
    console.error("Error loading integration for manual search:", integrationError);
    return json({ error: "Erro ao carregar integração" }, 500);
  }
  if (!integration) return json({ error: "Integração não encontrada" }, 404);
  if (integration.source !== "jusbrasil") {
    return json({ error: "Busca manual disponível apenas para integrações JusBrasil" }, 400);
  }

  const result = await pollJusbrasilIntegration(adminClient, integration, "manual");
  if (result.error) return json({ error: result.error, imported: result.imported }, 502);
  return json({ success: true, imported: result.imported });
});
