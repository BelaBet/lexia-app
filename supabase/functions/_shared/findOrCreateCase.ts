// Compartilhado entre publication-webhook e poll-jusbrasil: quando uma nova
// publicação/processo chega automaticamente da API, o sistema já abre (ou
// reaproveita) um Caso correspondente em "Casos", para o advogado ver o
// processo lá — não só na lista de Publicações. O caso é identificado pelo
// número do processo; se já existir um caso com esse número para o mesmo
// usuário, a publicação é só vinculada a ele (não duplica).
//
// Título/cliente são preenchidos com um valor provisório, para o advogado
// completar depois — o objetivo aqui é só garantir que o caso já apareça na
// tela de Casos assim que a publicação chegar, sem exigir nenhuma ação
// manual antes disso.
//
// Quando o payload da fonte externa (JusBrasil, WebJur etc.) já traz dados
// processuais (vara, comarca, valor da causa, datas de abertura/aceitação),
// esses dados são gravados no Caso recém-criado também — assim eles ficam
// destacados tanto em Publicações quanto em Casos sem esperar o advogado
// preencher manualmente.

export interface ProcessualData {
  vara?: string | null;
  comarca?: string | null;
  valor_causa?: number | null;
  data_abertura_tribunal?: string | null;
  data_aceitacao?: string | null;
}

// deno-lint-ignore no-explicit-any
export async function findOrCreateCaseId(
  // deno-lint-ignore no-explicit-any
  adminClient: any,
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
    // Se dois eventos chegarem ao mesmo tempo para o mesmo processo, é
    // possível que o caso já tenha sido criado entre a busca e a inserção
    // acima — nesse caso, apenas busca de novo em vez de falhar.
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
