import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";

const BASE_URL = "https://op.digesto.com.br/api/base-judicial/tribproc";

function normalizeCnj(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (digits.length !== 20) return null;
  return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16)}`;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
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
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: "Configuração do Supabase ausente" }, 500);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { cnj?: string; dry_run?: boolean };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const cnj = normalizeCnj(body.cnj ?? "");
  if (!cnj) return json({ error: "CNJ inválido. Informe um número com 20 dígitos." }, 400);

  const requestUrl = `${BASE_URL}/${encodeURIComponent(cnj)}?tipo_numero=5`;

  // Segurança financeira: por padrão esta rota NUNCA chama o JusBrasil.
  // O dry-run permite validar autenticação, formato do CNJ e montagem da
  // requisição sem consumir consulta/crédito no provedor.
  if (body.dry_run !== false) {
    return json({
      success: true,
      dry_run: true,
      cnj,
      provider: "jusbrasil",
      operation: "consulta_cnj",
      request: { method: "GET", url: requestUrl },
      message: "Pré-validação concluída. Nenhuma chamada ao JusBrasil foi executada.",
    });
  }

  // Segundo cadeado: mesmo com dry_run=false, uma chamada real só é aceita
  // quando o operador habilitar explicitamente a flag no backend.
  if (Deno.env.get("JUSBRASIL_REAL_CALLS_ENABLED") !== "true") {
    return json({
      error: "Chamadas reais ao JusBrasil estão bloqueadas pelo backend",
      dry_run: false,
      cnj,
    }, 403);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let token: string;
  try {
    token = await getJusbrasilApiToken(adminClient);
  } catch (error) {
    console.error(error);
    return json({ error: "Integração JusBrasil não configurada" }, 500);
  }

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  });

  const raw = await response.text();
  let data: unknown = raw;
  try { data = raw ? JSON.parse(raw) : null; } catch { /* mantém texto bruto */ }

  if (!response.ok) {
    console.error(`JusBrasil CNJ respondeu ${response.status}`);
    return json({ error: "Erro na consulta JusBrasil", provider_status: response.status, details: data }, 502);
  }

  return json({ success: true, dry_run: false, cnj, data });
});
