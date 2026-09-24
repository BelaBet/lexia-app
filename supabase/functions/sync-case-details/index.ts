// Sincroniza, para UM processo já importado, os detalhes que o provedor já
// tem em base (movimentações, partes, audiências, autos) — chamado
// automaticamente ao abrir a tela do processo (ver
// src/components/cases/JusbrasilCaseDetails.tsx) e manualmente pelo botão
// "Sincronizar detalhes". Lógica de sincronização em si compartilhada com
// sync-all-case-details (varredura diária) via _shared/syncCaseDetails.ts.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getJusbrasilToken, syncCaseDetails } from "../_shared/syncCaseDetails.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRole) return json({ error: "Configuração incompleta" }, 500);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida" }, 401);

  let body: { case_id?: string; force?: boolean; update_password?: string };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  if (!body.case_id) return json({ error: "case_id é obrigatório" }, 400);

  // Atualizações manuais forçadas exigem a senha de liberação. A senha em si
  // nunca fica no frontend nem no código: somente o SHA-256 esperado é comparado.
  if (body.force) {
    const password = typeof body.update_password === "string" ? body.update_password : "";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
    const hash = Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hash !== "6ffe46e661afcb326620e905ef4346793cc0415db339566e93c5ea931a013624") {
      return json({ error: "Senha de liberação inválida" }, 403);
    }
  }

  const admin = createClient(supabaseUrl, serviceRole);
  const { data: result, error: resultError } = await admin.from("process_search_results")
    .select("*").eq("case_id", body.case_id).eq("user_id", user.id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (resultError) return json({ error: "Erro ao carregar processo" }, 500);
  if (!result) return json({ error: "Processo não encontrado" }, 404);

  let token: string;
  try { token = await getJusbrasilToken(admin); } catch (e) { return json({ error: e instanceof Error ? e.message : "Integração indisponível" }, 500); }

  try {
    const sync = await syncCaseDetails(admin, result, token, Boolean(body.force));
    return json({ success: true, ...sync });
  } catch (e) {
    const message = e instanceof Error ? e.message : "O provedor de dados está temporariamente indisponível.";
    return json({
      success: false,
      provider_unavailable: true,
      preserved_existing_data: true,
      message: message.includes("status 502")
        ? "O provedor de dados está temporariamente indisponível. Os dados já existentes do processo foram preservados."
        : message,
    }, 200);
  }
});
