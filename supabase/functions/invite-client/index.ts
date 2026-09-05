// Convida um cliente para o "Meu Jurídico" (portal do cliente): cadastra
// (ou reaproveita) o registro em `clients`, vincula ao processo em
// `case_clients` e envia o convite de acesso pelo próprio Supabase Auth
// (e-mail com link para o cliente definir a senha).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { buildCorsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const siteUrl = Deno.env.get("SITE_URL") || "https://lexia-app-rho.vercel.app";
  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) return json({ error: "Configuração do Supabase ausente" }, 500);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Autenticação obrigatória" }, 401);

  const callerClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: userError } = await callerClient.auth.getUser();
  if (userError || !user) return json({ error: "Sessão inválida ou expirada" }, 401);

  let body: { case_id?: string; full_name?: string; email?: string; phone?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo da requisição inválido" }, 400);
  }

  const caseId = body.case_id?.trim();
  const fullName = body.full_name?.trim();
  const email = body.email?.trim().toLowerCase();
  const phone = body.phone?.trim() || null;

  if (!caseId || !fullName || !email) return json({ error: "Informe o processo, o nome e o e-mail do cliente" }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "E-mail inválido" }, 400);

  const admin = createClient(supabaseUrl, serviceRoleKey);

  // Confirma que quem está chamando é o dono do processo.
  const { data: caseRow, error: caseError } = await admin
    .from("cases")
    .select("id, user_id, title")
    .eq("id", caseId)
    .maybeSingle();

  if (caseError) {
    console.error("invite-client: error loading case", caseError);
    return json({ error: "Erro ao verificar o processo" }, 500);
  }
  if (!caseRow || caseRow.user_id !== user.id) return json({ error: "Processo não encontrado ou sem permissão" }, 404);

  // Já existe um cadastro deste e-mail como cliente deste advogado?
  const { data: existingClient, error: existingError } = await admin
    .from("clients")
    .select("id, user_id, full_name")
    .eq("owner_id", user.id)
    .ilike("email", email)
    .maybeSingle();

  if (existingError) {
    console.error("invite-client: error loading existing client", existingError);
    return json({ error: "Erro ao verificar cliente existente" }, 500);
  }

  let clientId: string;
  let clientUserId: string | null = existingClient?.user_id ?? null;
  const alreadyHadAccess = Boolean(clientUserId);

  if (existingClient) {
    clientId = existingClient.id;
    if (fullName !== existingClient.full_name) {
      await admin.from("clients").update({ full_name: fullName, phone }).eq("id", clientId);
    }
  } else {
    const { data: inserted, error: insertError } = await admin
      .from("clients")
      .insert({ owner_id: user.id, full_name: fullName, email, phone, invite_status: "pending" })
      .select("id")
      .single();
    if (insertError || !inserted) {
      console.error("invite-client: error creating client", insertError);
      return json({ error: "Erro ao cadastrar o cliente" }, 500);
    }
    clientId = inserted.id;
  }

  // Vincula o cliente a este processo (não duplica se já existir o vínculo).
  const { error: linkError } = await admin
    .from("case_clients")
    .upsert({ case_id: caseId, client_id: clientId }, { onConflict: "case_id,client_id", ignoreDuplicates: true });
  if (linkError) {
    console.error("invite-client: error linking client to case", linkError);
    return json({ error: "Erro ao vincular cliente ao processo" }, 500);
  }

  // Se o cliente ainda não tem login no portal, envia o convite por e-mail.
  if (!clientUserId) {
    const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/portal/definir-senha`,
      data: { portal_role: "client", full_name: fullName },
    });

    if (inviteError) {
      const alreadyExists = /already been registered|already exists|already registered/i.test(inviteError.message || "");
      if (alreadyExists) {
        // O e-mail já é um usuário do Supabase Auth (ex.: já é cliente em
        // outro processo, ou já tem conta própria no LexIA) — reaproveita em
        // vez de falhar.
        const lookupResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
          headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
        });
        const lookupData = await lookupResponse.json().catch(() => null);
        const foundUser = Array.isArray(lookupData?.users) ? lookupData.users[0] : null;
        if (foundUser?.id) {
          clientUserId = foundUser.id;
        } else {
          console.error("invite-client: could not resolve existing user for", email, inviteError);
          return json({ error: "Este e-mail já tem uma conta, mas não foi possível vincular automaticamente." }, 500);
        }
      } else {
        console.error("invite-client: invite error", inviteError);
        return json({ error: "Erro ao enviar o convite por e-mail" }, 500);
      }
    } else {
      clientUserId = inviteData?.user?.id ?? null;
    }

    if (clientUserId) {
      await admin
        .from("clients")
        .update({ user_id: clientUserId, invite_status: "sent", invited_at: new Date().toISOString() })
        .eq("id", clientId);
    }
  }

  return json({ success: true, client_id: clientId, already_had_access: alreadyHadAccess });
});
