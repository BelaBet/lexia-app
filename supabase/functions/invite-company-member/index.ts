// Convida um usuário para uma empresa (tenant white label). Só
// admin/supremo da plataforma pode chamar — cadastro de usuários de
// empresa não é self-service (ver migration
// 20260923000100_company_registration). Se o e-mail já tem conta e
// ainda não pertence a nenhuma empresa, associa direto; se já pertence a
// outra empresa, recusa (evita mover alguém de empresa sem uma ação
// explícita de transferência).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = Deno.env.get("SITE_URL") || "https://lexia-app-rho.vercel.app";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  const { data: actorRoles, error: actorError } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  if (actorError) return json({ error: "Não foi possível validar permissões" }, 500);
  const isPlatformAdmin = actorRoles?.some((r) => r.role === "admin" || r.role === "supremo") ?? false;
  if (!isPlatformAdmin) return json({ error: "Acesso negado" }, 403);

  let body: { company_id?: string; full_name?: string; email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }

  const companyId = body.company_id?.trim();
  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();

  if (!companyId || !fullName || !email) return json({ error: "Informe a empresa, o nome e o e-mail" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);

  const { data: company, error: companyError } = await admin
    .from("whitelabel_companies")
    .select("id, name")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) return json({ error: "Erro ao verificar a empresa" }, 500);
  if (!company) return json({ error: "Empresa não encontrada" }, 404);

  // E-mail já é um usuário existente? Associa direto à empresa em vez de
  // reenviar convite de cadastro (evita duplicar conta).
  const lookupResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const lookupData = await lookupResponse.json().catch(() => null);
  const existingUser = Array.isArray(lookupData?.users)
    ? lookupData.users.find((u: { email?: string }) => (u.email || "").toLowerCase() === email)
    : null;

  if (existingUser?.id) {
    const { data: existingProfile, error: profileError } = await admin
      .from("profiles")
      .select("user_id, company_id")
      .eq("user_id", existingUser.id)
      .maybeSingle();
    if (profileError) return json({ error: "Erro ao verificar o usuário existente" }, 500);

    if (existingProfile?.company_id && existingProfile.company_id !== companyId) {
      return json({ error: "Este e-mail já pertence a outra empresa. Remova-o de lá antes de transferir." }, 409);
    }

    const { error: updateError } = await admin
      .from("profiles")
      .update({ company_id: companyId })
      .eq("user_id", existingUser.id);
    if (updateError) {
      console.error("invite-company-member: error linking existing user", updateError);
      return json({ error: "Erro ao associar o usuário à empresa" }, 500);
    }

    return json({ success: true, user_id: existingUser.id, company: company.name, already_existed: true });
  }

  const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/empresa/definir-senha`,
    data: { full_name: fullName, company_id: companyId },
  });

  if (inviteError) {
    console.error("invite-company-member: invite error", inviteError);
    return json({ error: "Erro ao enviar o convite por e-mail" }, 500);
  }

  return json({ success: true, user_id: inviteData?.user?.id ?? null, company: company.name, already_existed: false });
});
