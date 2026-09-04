import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

// Compartilhado entre publication-webhook e poll-jusbrasil: quando uma nova
// publicação/processo chega automaticamente da API, o sistema já abre (ou
// reaproveita) um Caso correspondente em "Casos", para o advogado ver o
// processo lá — não só na lista de Publicações. O caso é identificado pelo
// número do processo; se já existir um caso com esse número para o mesmo
// usuário, a publicação é só vinculada a ele (não duplica).

export interface ProcessualData {
  vara?: string | null;
  comarca?: string | null;
  valor_causa?: number | null;
  data_abertura_tribunal?: string | null;
  data_aceitacao?: string | null;
}

export async function findOrCreateCaseId(
  adminClient: SupabaseClient,
  userId: string,
  processNumber: string | null,
  processualData?: ProcessualData,
): Promise<string | null> {
  if (!processNumber) return null;

  const { data: existing, error: findError } = await adminClient
    .from("cases")
    .select("id")
    .eq("user_id", userId)
    .eq("case_number", processNumber)
    .maybeSingle();

  if (findError) {
    console.error("Error looking up existing case:", findError);
    return null;
  }
  if (existing) return existing.id as string;

  const { data: created, error: createError } = await adminClient
    .from("cases")
    .insert({
      user_id: userId,
      case_number: processNumber,
      title: `Processo ${processNumber}`,
      client: "A definir",
      type: "Cível",
      status: "active",
      vara: processualData?.vara || null,
      comarca: processualData?.comarca || null,
      valor_causa: processualData?.valor_causa ?? null,
      data_abertura_tribunal: processualData?.data_abertura_tribunal || null,
      data_aceitacao: processualData?.data_aceitacao || null,
    })
    .select("id")
    .maybeSingle();

  if (createError) {
    const { data: retry } = await adminClient
      .from("cases")
      .select("id")
      .eq("user_id", userId)
      .eq("case_number", processNumber)
      .maybeSingle();
    if (retry) return retry.id as string;
    console.error("Error auto-creating case:", createError);
    return null;
  }

  return created?.id ?? null;
}
