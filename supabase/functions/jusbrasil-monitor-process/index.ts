// Registra um processo JÁ EXISTENTE (tela "Rastreamento de Publicações",
// botão "Rastrear") para monitoramento direto por CNJ no JusBrasil —
// publicações futuras chegam via jusbrasil-webhook, sem precisar de uma
// integração por nome/OAB (supabase/functions/jusbrasil-webhook/index.ts já
// resolve o destino pelo número do processo em `cases` quando não há
// source_user_custom, então este endpoint não precisa criar nem depender de
// nenhuma linha em publication_integrations — essa tela de configuração foi
// removida do sistema).
//
// Trava de segurança financeira: registrar um processo pode ter custo no
// provedor, então isso só acontece de verdade quando o secret
// JUSBRASIL_REAL_CALLS_ENABLED estiver como "true" nas Edge Functions do
// Supabase. Enquanto não estiver, a chamada é recusada com uma mensagem
// clara em vez de silenciosamente simular sucesso.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";
import { normalizeCnj } from "../_shared/jusbrasilCnj.ts";

const MONITOR_URL = "https://op.digesto.com.br/api/monitoramento/proc";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

  let body: { case_id?: string; monitor_tribunal?: boolean; monitor_diario?: boolean; instancia?: number };
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  if (!body.case_id) return json({ error: "case_id é obrigatório" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: caseRow, error: caseError } = await admin
    .from("cases")
    .select("id, case_number, jusbrasil_monitoring_active")
    .eq("id", body.case_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (caseError) return json({ error: "Erro ao carregar o processo" }, 500);
  if (!caseRow) return json({ error: "Processo não encontrado" }, 404);

  if (caseRow.jusbrasil_monitoring_active) {
    return json({ success: true, already_active: true, message: "Este processo já está sendo rastreado." });
  }

  const cnj = normalizeCnj(caseRow.case_number ?? "");
  if (!cnj) return json({ error: "Este processo não tem um número CNJ válido para rastrear." }, 400);

  if (Deno.env.get("JUSBRASIL_REAL_CALLS_ENABLED") !== "true") {
    return json({ error: "O rastreamento de publicações ainda não foi habilitado no backend (secret JUSBRASIL_REAL_CALLS_ENABLED)." }, 403);
  }

  let token: string;
  try { token = await getJusbrasilApiToken(admin); }
  catch { return json({ error: "Integração JusBrasil não configurada no backend" }, 500); }

  const payload = {
    numero: cnj,
    tipo_numero: 5,
    is_monitored_tribunal: body.monitor_tribunal ?? true,
    is_monitored_diario: body.monitor_diario ?? true,
    instancia: body.instancia ?? 1,
  };

  const response = await fetch(MONITOR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data: unknown = raw;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* mantém texto */ }

  if (!response.ok) {
    console.error(`JusBrasil monitoramento respondeu ${response.status}`);
    return json({ error: "Erro ao registrar rastreamento no JusBrasil", provider_status: response.status, details: data }, 502);
  }

  const { error: updateError } = await admin
    .from("cases")
    .update({ jusbrasil_monitoring_active: true, jusbrasil_monitoring_started_at: new Date().toISOString() })
    .eq("id", caseRow.id);
  if (updateError) console.error("jusbrasil-monitor-process: erro ao marcar processo como rastreado", updateError);

  return json({ success: true, cnj, data });
});
