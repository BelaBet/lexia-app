// Classificação automática de prazos: ao chegar uma movimentação/publicação
// (webhook ou busca ativa), tenta detectar o tipo de ato processual pelo
// conteúdo e calcular o prazo real em dias úteis, por área do direito (ver
// migration 20260921000000_deadline_rules.sql para as regras semeadas e o
// racional de is_variable).
//
// IMPORTANTE: o resultado é sempre informação COMPLEMENTAR — nunca substitui
// external_deadline/internal_deadline (que seguem vindo cru da API). Quando
// não há área conhecida para o caso, nenhum ato bate com o conteúdo, ou a
// regra é variável (faixa de dias, "depende do órgão", "na audiência",
// prescrição), o classificador não inventa uma data: needsReview fica
// marcado (ou nenhuma classificação é retornada) para o advogado conferir.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";
import { addBusinessDays, type BlockedRange } from "./businessDays.ts";

export type DeadlineArea = "civel" | "criminal" | "trabalhista" | "administrativo_tributario";

export interface DeadlineRule {
  area: DeadlineArea;
  act_name: string;
  deadline_value: number | null;
  deadline_min: number | null;
  deadline_max: number | null;
  deadline_unit: "dias_uteis" | "anos";
  is_variable: boolean;
  trigger_description: string | null;
}

export interface ClassificationResult {
  area: DeadlineArea;
  actName: string;
  deadline: string | null;
  deadlineUnit: "dias_uteis" | "anos";
  needsReview: boolean;
  ruleNote: string;
}

// cases.type usa os rótulos livres definidos em CasesManager.tsx
// (typeOptions). "Família" não tem tabela de prazos fornecida — nesse caso,
// e para qualquer tipo desconhecido/ausente, não tentamos classificar.
const CASE_TYPE_TO_AREA: Record<string, DeadlineArea> = {
  "Cível": "civel",
  "Criminal": "criminal",
  "Trabalhista": "trabalhista",
  "Tributário": "administrativo_tributario",
  "Administrativo": "administrativo_tributario",
};

const AREA_LABEL: Record<DeadlineArea, string> = {
  civel: "Cível",
  criminal: "Criminal",
  trabalhista: "Trabalhista",
  administrativo_tributario: "Administrativo/Tributário",
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function mapCaseTypeToArea(caseType: string | null): DeadlineArea | null {
  if (!caseType) return null;
  return CASE_TYPE_TO_AREA[caseType.trim()] ?? null;
}

export async function loadCaseType(
  adminClient: SupabaseClient,
  caseId: string | null,
): Promise<string | null> {
  if (!caseId) return null;
  const { data, error } = await adminClient
    .from("cases")
    .select("type")
    .eq("id", caseId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { type: string | null }).type;
}

let cachedRules: DeadlineRule[] | null = null;

// As regras são estáticas (só mudam por migration) — cacheia por invocação
// de função para não bater no banco a cada movimentação de um mesmo lote.
export async function loadDeadlineRules(adminClient: SupabaseClient): Promise<DeadlineRule[]> {
  if (cachedRules) return cachedRules;

  const { data, error } = await adminClient
    .from("deadline_rules")
    .select("area, act_name, deadline_value, deadline_min, deadline_max, deadline_unit, is_variable, trigger_description");

  if (error) {
    console.error("Error loading deadline_rules:", error);
    return [];
  }

  cachedRules = (data ?? []) as DeadlineRule[];
  return cachedRules;
}

function variableRuleNote(rule: DeadlineRule): string {
  const range = rule.deadline_min != null && rule.deadline_max != null && rule.deadline_min !== rule.deadline_max
    ? `${rule.deadline_min} a ${rule.deadline_max} ${rule.deadline_unit === "anos" ? "anos" : "dias úteis"}`
    : null;
  const parts = [
    `${rule.act_name} (${AREA_LABEL[rule.area]})`,
    range ?? "prazo variável",
    rule.trigger_description,
    "confira manualmente",
  ].filter(Boolean);
  return parts.join(" — ");
}

function fixedRuleNote(rule: DeadlineRule): string {
  const parts = [
    `${rule.act_name} (${AREA_LABEL[rule.area]})`,
    `${rule.deadline_value} dias úteis`,
    rule.trigger_description,
  ].filter(Boolean);
  return parts.join(" — ");
}

// content: texto da movimentação/publicação. caseType: cases.type do
// processo vinculado (ou null se não houver processo/tipo definido).
// triggerDateStr: data do próprio movimento (published_date), usada como
// início da contagem de dias úteis.
export function classifyDeadline(
  content: string,
  caseType: string | null,
  triggerDateStr: string,
  rules: DeadlineRule[],
  blockedRanges: BlockedRange[],
): ClassificationResult | null {
  const area = mapCaseTypeToArea(caseType);
  if (!area) return null;

  const normalizedContent = normalize(content);
  const candidates = rules.filter((r) => r.area === area);

  // Entre atos cujo nome aparece no texto, prioriza o mais específico
  // (nome mais longo) — evita, por exemplo, "Recurso" bater antes de
  // "Recurso Especial" quando ambos existiriam na mesma área.
  let best: DeadlineRule | null = null;
  for (const rule of candidates) {
    if (normalizedContent.includes(normalize(rule.act_name))) {
      if (!best || rule.act_name.length > best.act_name.length) best = rule;
    }
  }
  if (!best) return null;

  if (best.is_variable || best.deadline_value == null) {
    return {
      area,
      actName: best.act_name,
      deadline: null,
      deadlineUnit: best.deadline_unit,
      needsReview: true,
      ruleNote: variableRuleNote(best),
    };
  }

  // Só dias_uteis é calculado automaticamente — todas as regras em "anos"
  // (prescrição) já vêm marcadas is_variable=true na semente, por
  // dependerem de histórico do processo não aferível de uma única
  // movimentação.
  if (best.deadline_unit !== "dias_uteis") {
    return {
      area,
      actName: best.act_name,
      deadline: null,
      deadlineUnit: best.deadline_unit,
      needsReview: true,
      ruleNote: variableRuleNote(best),
    };
  }

  const deadline = addBusinessDays(triggerDateStr, best.deadline_value, blockedRanges);
  return {
    area,
    actName: best.act_name,
    deadline,
    deadlineUnit: "dias_uteis",
    needsReview: false,
    ruleNote: fixedRuleNote(best),
  };
}
