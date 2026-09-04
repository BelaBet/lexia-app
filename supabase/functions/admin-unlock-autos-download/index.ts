// Libera um NOVO download dos autos de um processo que já foi baixado
// antes. Só quem tem role "admin" ou "supremo" (tabela user_roles) pode
// chamar — validado aqui com a service role antes de qualquer alteração,
// já que as colunas de trava (autos_download_locked etc.) não podem ser
// alteradas pelo usuário comum direto pelo banco (ver migração
// name_search_autos_download_lock).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

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

  const adminClient = createClient(supabaseUrl, serviceRoleKey);

  const { data: roles, error: rolesError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id);

  if (rolesError) {
    console.error("Error checking caller role:", rolesError);
    return json({ error: "Erro ao validar permissão" }, 500);
  }
  const isAdmin = (roles ?? []).some((r) => r.role === "admin" || r.role === "supremo");
  if (!isAdmin) return json({ error: "Apenas administradores podem liberar um novo download dos autos." }, 403);

  let body: { result_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }
  const resultId = body.result_id;
  if (!resultId) return json({ error: "result_id é obrigatório" }, 400);

  const { data: result, error: resultError } = await adminClient
    .from("process_search_results")
    .select("id, process_number, autos_download_locked")
    .eq("id", resultId)
    .maybeSingle();

  if (resultError) {
    console.error("Error loading result to unlock:", resultError);
    return json({ error: "Erro ao carregar processo" }, 500);
  }
  if (!result) return json({ error: "Processo não encontrado" }, 404);

  const { error: updateError } = await adminClient
    .from("process_search_results")
    .update({
      autos_download_locked: false,
      autos_status: "nao_solicitado",
      autos_unlocked_by: user.id,
      autos_unlocked_at: new Date().toISOString(),
      autos_unlock_reason: (body.reason ?? "").slice(0, 500) || null,
    })
    .eq("id", resultId);

  if (updateError) {
    console.error("Error unlocking autos download:", updateError);
    return json({ error: "Erro ao liberar novo download" }, 500);
  }

  await adminClient.from("notifications").insert({
    user_id: user.id,
    title: "Download de autos liberado",
    message: `Um novo download dos autos do processo ${result.process_number ?? resultId} foi liberado.`,
    link_tab: "process-search",
  });

  return json({ success: true });
});
