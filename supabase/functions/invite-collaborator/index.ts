// Convida um colaborador (advogado associado, estagiário etc.) para
// acessar processos específicos da conta de quem chama — nunca a conta
// inteira. Cadastra (ou reaproveita) a conta pelo Supabase Auth e grava o
// acesso em case_collaborators para cada processo informado; a
// visibilidade restrita ("só vê os processos atribuídos") é garantida
// pelas policies de RLS (ver migration 20261008000000_case_collaborators),
// não por este endpoint.

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
  const siteUrl = Deno.env.get("SITE_URL") || "https://lexia.meuhub.site";
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const callerClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { full_name?: string; cpf?: string; email?: string; case_ids?: string[]; password?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }

  const fullName = body.full_name?.trim();
  const cpf = body.cpf?.trim() || null;
  const email = body.email?.trim().toLowerCase();
  const caseIds = Array.isArray(body.case_ids) ? [...new Set(body.case_ids.filter((id) => typeof id === "string" && id))] : [];
  // Senha inicial é opcional: quando informada, a conta já nasce pronta pra
  // uso com essa senha (sem depender do e-mail de convite chegar); a pessoa
  // troca depois em Configurações. Sem senha, mantém o fluxo por e-mail.
  const password = body.password?.trim() || null;

  if (!fullName || !email) return json({ error: "Informe o nome e o e-mail do colaborador" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);
  if (caseIds.length === 0) return json({ error: "Selecione ao menos um processo para atribuir" }, 400);
  if (password && password.length < 6) return json({ error: "A senha inicial precisa ter pelo menos 6 caracteres" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Confirma que TODOS os processos pertencem a quem está chamando antes de
  // conceder qualquer acesso — nunca confia em case_ids vindo do cliente
  // sem checar a titularidade.
  const { data: ownedCases, error: casesError } = await admin
    .from("cases")
    .select("id")
    .eq("user_id", user.id)
    .in("id", caseIds);

  if (casesError) {
    console.error("invite-collaborator: error loading cases", casesError);
    return json({ error: "Erro ao verificar os processos" }, 500);
  }
  const ownedIds = new Set((ownedCases ?? []).map((c) => c.id as string));
  const missing = caseIds.filter((id) => !ownedIds.has(id));
  if (missing.length > 0) {
    return json({ error: "Um ou mais processos não foram encontrados ou não pertencem a você" }, 404);
  }

  // E-mail já é um usuário existente? Só reaproveitamos a conta se ela já
  // tiver sido criada por ESTE MESMO fluxo (user_metadata.collaborator_role
  // === true) — a mesma pessoa pode colaborar com mais de um escritório.
  // Qualquer outra conta (ex.: um advogado com login próprio, ou um cliente
  // do portal) NÃO é reaproveitada, para não conceder acesso a um processo
  // a uma conta que a pessoa já usa para outra coisa sem checagem.
  const lookupResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  const lookupData = await lookupResponse.json().catch(() => null);
  const existingUser = Array.isArray(lookupData?.users)
    ? lookupData.users.find((u: { email?: string }) => (u.email || "").toLowerCase() === email)
    : null;

  let collaboratorUserId: string;
  let alreadyExisted = false;
  let passwordSet = false;

  if (existingUser?.id) {
    const isExistingCollaborator = existingUser?.user_metadata?.collaborator_role === true;
    if (!isExistingCollaborator) {
      return json({
        error: "Este e-mail já tem uma conta associada a outro tipo de acesso. Peça para a pessoa usar outro e-mail, ou entre em contato com o suporte.",
      }, 409);
    }
    collaboratorUserId = existingUser.id;
    alreadyExisted = true;
  } else if (password) {
    const { data: createdData, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, cpf, collaborator_role: true },
    });
    if (createError || !createdData?.user?.id) {
      console.error("invite-collaborator: createUser error", createError);
      return json({ error: "Erro ao criar o usuário" }, 500);
    }
    collaboratorUserId = createdData.user.id;
    passwordSet = true;
  } else {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/empresa/definir-senha`,
      data: { full_name: fullName, cpf, collaborator_role: true },
    });
    if (inviteError || !inviteData?.user?.id) {
      console.error("invite-collaborator: invite error", inviteError);
      return json({ error: "Erro ao enviar o convite por e-mail" }, 500);
    }
    collaboratorUserId = inviteData.user.id;
  }

  // Garante o cpf no profile mesmo quando a conta já existia (ex.: convite
  // anterior sem cpf informado).
  if (cpf) {
    await admin.from("profiles").update({ cpf }).eq("user_id", collaboratorUserId);
  }

  const rows = caseIds.map((caseId) => ({ case_id: caseId, collaborator_user_id: collaboratorUserId, assigned_by: user.id }));
  const { error: assignError } = await admin
    .from("case_collaborators")
    .upsert(rows, { onConflict: "case_id,collaborator_user_id", ignoreDuplicates: true });

  if (assignError) {
    console.error("invite-collaborator: error assigning cases", assignError);
    return json({ error: "O convite foi enviado, mas não foi possível atribuir os processos" }, 500);
  }

  return json({
    success: true,
    collaborator_user_id: collaboratorUserId,
    already_existed: alreadyExisted,
    password_set: passwordSet,
    assigned_count: caseIds.length,
  });
});
