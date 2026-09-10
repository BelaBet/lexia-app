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

  let body: {
    cnj?: string;
    integration_id?: string;
    dry_run?: boolean;
    monitor_tribunal?: boolean;
    monitor_diario?: boolean;
    instancia?: number;
  };
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const cnj = normalizeCnj(body.cnj ?? "");
  if (!cnj) return json({ error: "CNJ inválido. Informe um número com 20 dígitos." }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);
  let query = admin
    .from("publication_integrations")
    .select("id, user_id, source, is_active")
    .eq("user_id", user.id)
    .eq("source", "jusbrasil")
    .eq("is_active", true);

  if (body.integration_id) query = query.eq("id", body.integration_id);
  else query = query.is("linked_client_id", null).order("created_at", { ascending: true }).limit(1);

  const { data: integrations, error: integrationError } = await query;
  if (integrationError) return json({ error: "Erro ao carregar integração JusBrasil" }, 500);
  const integration = integrations?.[0];
  if (!integration) return json({ error: "Integração JusBrasil ativa não encontrada" }, 404);

  const payload = {
    numero: cnj,
    tipo_numero: 5,
    is_monitored_tribunal: body.monitor_tribunal ?? true,
    is_monitored_diario: body.monitor_diario ?? true,
    instancia: body.instancia ?? 1,
    // Identificador white-label: o JusBrasil devolve este valor em
    // source_user_custom nos eventos de webhook.
    user_custom: integration.id,
  };

  // Segurança financeira: por padrão apenas valida e mostra o que seria
  // enviado. Nenhuma chamada ao provedor é feita.
  if (body.dry_run !== false) {
    return json({
      success: true,
      dry_run: true,
      cnj,
      integration_id: integration.id,
      request: { method: "POST", url: MONITOR_URL, body: payload },
      message: "Monitoramento preparado com roteamento white-label. Nenhuma chamada ao JusBrasil foi executada.",
    });
  }

  if (Deno.env.get("JUSBRASIL_REAL_CALLS_ENABLED") !== "true") {
    return json({ error: "Chamadas reais ao JusBrasil estão bloqueadas pelo backend" }, 403);
  }

  let token: string;
  try { token = await getJusbrasilApiToken(admin); }
  catch { return json({ error: "Integração JusBrasil não configurada no backend" }, 500); }

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
    return json({ error: "Erro ao registrar monitoramento no JusBrasil", provider_status: response.status, details: data }, 502);
  }

  return json({ success: true, dry_run: false, cnj, integration_id: integration.id, data });
});
