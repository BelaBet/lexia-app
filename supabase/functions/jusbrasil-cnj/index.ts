import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getJusbrasilApiToken } from "../_shared/jusbrasilToken.ts";
import { normalizeCnj, buildJusbrasilCnjUrl } from "../_shared/jusbrasilCnj.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  let body: { cnj?: string; dry_run?: boolean; confirm_charge?: boolean };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }

  const cnj = normalizeCnj(body.cnj ?? "");
  if (!cnj) return json({ error: "CNJ inválido. Informe um número com 20 dígitos." }, 400);
  const requestUrl = buildJusbrasilCnjUrl(cnj);

  if (body.dry_run !== false) {
    return json({
      success: true,
      dry_run: true,
      cnj,
      provider: "jusbrasil",
      operation: "consulta_cnj",
      message: "CNJ validado. A consulta real ainda não foi executada.",
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  // Uma chamada paga só pode ocorrer após confirmação explícita enviada pela própria tela da LEXIA.
  if (body.confirm_charge !== true) {
    return json({ error: "Confirmação da consulta obrigatória", requires_confirmation: true, cnj }, 409);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  let token: string;
  try { token = await getJusbrasilApiToken(adminClient); }
  catch (error) {
    console.error(error);
    return json({ error: "Integração JusBrasil não configurada" }, 500);
  }

  const response = await fetch(requestUrl, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
  });

  const raw = await response.text();
  let data: unknown = raw;
  try { data = raw ? JSON.parse(raw) : null; } catch {}

  if (!response.ok) {
    console.error(`JusBrasil CNJ respondeu ${response.status}`);
    return json({ error: "Erro na consulta JusBrasil", provider_status: response.status, details: data }, 502);
  }

  return json({ success: true, dry_run: false, cnj, provider: "jusbrasil", operation: "consulta_cnj", data });
});
