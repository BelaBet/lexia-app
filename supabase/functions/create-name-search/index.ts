// Inicia uma busca de processos por NOME (CRM de busca) — chamado pelo
// botão "Buscar" na nova tela. Cria o relatório no JusBrasil, já inicia a
// cobrança (busca paga, pode levar até 72h para ficar pronta) e grava tudo
// em process_search_reports para acompanhamento.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createNameSearchReport, startNameSearchBilling } from "../_shared/jusbrasilNameSearch.ts";

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

  let body: { name?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const name = (body.name ?? "").trim();
  if (!name || name.length < 3) return json({ error: "Informe um nome com pelo menos 3 letras" }, 400);

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  // Usa a integração JusBrasil já cadastrada em Integrações (mesma api_key
  // do monitoramento) — não pede uma chave nova.
  const { data: integration, error: integrationError } = await adminClient
    .from("publication_integrations")
    .select("id, api_key, price_per_name_search")
    .eq("user_id", user.id)
    .eq("source", "jusbrasil")
    .eq("is_active", true)
    .maybeSingle();

  if (integrationError) {
    console.error("Error loading jusbrasil integration:", integrationError);
    return json({ error: "Erro ao carregar integração JusBrasil" }, 500);
  }
  if (!integration?.api_key) {
    return json({ error: "Cadastre e ative sua integração JusBrasil em Integrações antes de buscar por nome." }, 400);
  }

  const { data: report, error: insertError } = await adminClient
    .from("process_search_reports")
    .insert({ user_id: user.id, integration_id: integration.id, search_name: name, status: "criando" })
    .select("id")
    .single();

  if (insertError || !report) {
    console.error("Error creating search report row:", insertError);
    return json({ error: "Erro ao registrar a busca" }, 500);
  }

  try {
    const { reportId } = await createNameSearchReport(integration.api_key, name, `Busca: ${name}`);
    await startNameSearchBilling(integration.api_key, reportId);

    await adminClient
      .from("process_search_reports")
      .update({
        jusbrasil_report_id: reportId,
        status: "processando",
        billed_at: new Date().toISOString(),
      })
      .eq("id", report.id);

    // Usa o preço configurado em Integrações (price_per_name_search) — antes
    // era gravado sempre 0, mesmo com um valor configurado, o que zerava o
    // contador financeiro independente da configuração comercial.
    const unitPrice = integration.price_per_name_search ?? 0;
    await adminClient.from("process_search_charges").insert({
      user_id: user.id,
      integration_id: integration.id,
      source: "jusbrasil",
      document: name,
      document_type: "nome",
      search_type: "busca_nome",
      unit_price: unitPrice,
      charged_amount: unitPrice,
    });

    return json({
      success: true,
      report_id: report.id,
      message: "Busca iniciada. O JusBrasil pode levar até 72 horas para concluir — você pode verificar o resultado depois.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Error starting name search:", message);
    await adminClient
      .from("process_search_reports")
      .update({ status: "erro", error_message: message.slice(0, 500) })
      .eq("id", report.id);
    return json({ error: `Erro ao iniciar busca no JusBrasil: ${message}` }, 502);
  }
});
