import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

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
  const { data: actorRoles, error: actorError } = await adminClient.from("user_roles").select("role").eq("user_id", user.id);
  if (actorError) return json({ error: "Não foi possível validar permissões" }, 500);
  const isSupremo = actorRoles?.some((r) => r.role === "supremo") ?? false;
  const isAdmin = isSupremo || (actorRoles?.some((r) => r.role === "admin") ?? false);
  if (!isAdmin) return json({ error: "Acesso negado" }, 403);

  let body: { userId?: string; newRole?: "admin" | "user" | "premium" | "supremo" };
  try { body = await req.json(); } catch { return json({ error: "JSON inválido" }, 400); }
  const targetUserId = body.userId;
  const newRole = body.newRole;
  if (!targetUserId || !newRole) return json({ error: "userId e newRole são obrigatórios" }, 400);
  if (targetUserId === user.id) return json({ error: "Você não pode alterar sua própria role" }, 400);
  if (newRole === "supremo" && !isSupremo) return json({ error: "Somente Supremo pode atribuir a role Supremo" }, 403);

  const { data: targetRoles, error: targetError } = await adminClient.from("user_roles").select("role").eq("user_id", targetUserId);
  if (targetError) return json({ error: "Não foi possível validar o usuário alvo" }, 500);
  const targetIsSupremo = targetRoles?.some((r) => r.role === "supremo") ?? false;
  if (targetIsSupremo && !isSupremo) return json({ error: "Somente Supremo pode alterar outro Supremo" }, 403);

  // BUG-04 (corrigido): antes isto era um delete() seguido de um insert()
  // como duas chamadas separadas — se o delete tivesse sucesso e o insert
  // falhasse (rede, conflito, etc.), o usuário-alvo ficava sem NENHUMA role
  // gravada, um estado inconsistente que poderia até bloquear seu acesso.
  // A função admin_set_user_role() no banco faz o delete+insert dentro de
  // uma única transação (chamada de função = uma transação implícita), então
  // ou as duas operações acontecem juntas, ou nenhuma acontece.
  const { error: roleError } = await adminClient.rpc("admin_set_user_role", {
    p_target_user_id: targetUserId,
    p_new_role: newRole,
  });
  if (roleError) {
    console.error("Error setting user role:", roleError);
    return json({ error: "Não foi possível atualizar a role" }, 500);
  }
  return json({ success: true, userId: targetUserId, role: newRole });
});
