// Cadastra uma nova empresa (tenant white label). Só admin/supremo da
// plataforma pode chamar — cadastro de empresa não é self-service (ver
// migration 20260923000100_company_registration).

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

  let body: {
    name?: string;
    legal_name?: string;
    document?: string;
    slug?: string;
    logo_url?: string;
    primary_color?: string;
    secondary_color?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }

  const name = body.name?.trim();
  const legalName = body.legal_name?.trim() || null;
  const document = body.document?.trim() || null;
  const slugInput = body.slug?.trim().toLowerCase();
  const logoUrl = body.logo_url?.trim() || null;
  const primaryColor = body.primary_color?.trim() || null;
  const secondaryColor = body.secondary_color?.trim() || null;

  if (!name) return json({ error: "Informe o nome da empresa" }, 400);

  const slug = slugInput || name
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return json({ error: "Slug inválido — use apenas letras minúsculas, números e hífens" }, 400);
  }

  const { data: existing, error: existingError } = await admin
    .from("whitelabel_companies")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (existingError) return json({ error: "Erro ao verificar slug" }, 500);
  if (existing) return json({ error: "Já existe uma empresa com este slug" }, 409);

  const { data: company, error: insertError } = await admin
    .from("whitelabel_companies")
    .insert({
      name,
      legal_name: legalName,
      document,
      slug,
      logo_url: logoUrl,
      primary_color: primaryColor,
      secondary_color: secondaryColor,
    })
    .select("*")
    .single();

  if (insertError || !company) {
    console.error("admin-create-company: error creating company", insertError);
    return json({ error: "Erro ao cadastrar a empresa" }, 500);
  }

  return json({ success: true, company });
});
