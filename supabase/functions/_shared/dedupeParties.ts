// O provedor (JusBrasil/Digesto) devolve a MESMA parte (mesmo parteID) várias
// vezes em "partes", uma para cada rótulo de relação ("REU" e "REU RE",
// "POLO PASSIVO PRINCIPAL" e "RECLAMADO"...), cada uma repetindo a mesma
// lista de advogados. Gravar isso como veio faz o réu e o advogado
// aparecerem duplicados. As partes podem vir como objetos ou como tuplas
// [processoParteAdvogadoID, parteID, nomeParte, nomeNormalizado, cnpj, cpf,
// documento, parteRelacaoID, relacaoNormalizado, advogados, ...] e cada
// advogado como objeto ou tupla [advogadoID, nome, oab, cpf, uf].

// deno-lint-ignore-file no-explicit-any

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export function lawyerKey(lawyer: any): string {
  if (Array.isArray(lawyer)) return str(lawyer[0]) || str(lawyer[2]) || str(lawyer[1]).toUpperCase();
  if (lawyer && typeof lawyer === "object") {
    return str(lawyer.advogadoID) || str(lawyer.oab) || str(lawyer.nomeNormalizado ?? lawyer.nome).toUpperCase();
  }
  return "";
}

function partyKey(party: any): string {
  const tuple = Array.isArray(party);
  const id = str(tuple ? party[1] : party?.parteID);
  if (id) return `id:${id}`;
  const name = str(tuple ? (party[3] ?? party[2]) : (party?.nomeNormalizado ?? party?.nomeParte)).toUpperCase();
  const doc = str(tuple ? (party[4] ?? party[5] ?? party[6]) : (party?.cnpj ?? party?.cpf ?? party?.documento)).replace(/\D/g, "");
  return name || doc ? `nd:${name}|${doc}` : "";
}

export function lawyersOf(party: any): any[] {
  const list = Array.isArray(party) ? party[9] : party?.advogados;
  return Array.isArray(list) ? list.filter(Boolean) : [];
}

export function dedupeLawyers(lawyers: any[]): any[] {
  const seen = new Set<string>();
  return lawyers.filter((lawyer) => {
    const key = lawyerKey(lawyer);
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Mantém a primeira ocorrência de cada parte e une (sem repetir) os
// advogados das ocorrências seguintes.
export function dedupeParties(parties: any[]): any[] {
  const byKey = new Map<string, number>();
  const result: any[] = [];
  for (const party of parties) {
    const key = partyKey(party);
    const index = key ? byKey.get(key) : undefined;
    if (index === undefined) {
      if (key) byKey.set(key, result.length);
      const lawyers = dedupeLawyers(lawyersOf(party));
      if (Array.isArray(party)) {
        const copy = [...party];
        if (Array.isArray(party[9])) copy[9] = lawyers;
        result.push(copy);
      } else {
        result.push(Array.isArray(party?.advogados) ? { ...party, advogados: lawyers } : party);
      }
      continue;
    }
    const current = result[index];
    const merged = dedupeLawyers([...lawyersOf(current), ...lawyersOf(party)]);
    if (Array.isArray(current)) current[9] = merged;
    else result[index] = { ...current, advogados: merged };
  }
  return result;
}

// Polo da parte, aceitando objeto ({is_autora, is_coautora, is_re}) ou tupla
// (posições 10, 11 e 12).
export function isActiveParty(party: any): boolean {
  return Array.isArray(party) ? Boolean(party[10] || party[11]) : Boolean(party?.is_autora || party?.is_coautora);
}

export function isPassiveParty(party: any): boolean {
  return Array.isArray(party) ? Boolean(party[12]) : Boolean(party?.is_re);
}
