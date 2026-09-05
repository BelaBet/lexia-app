// Ajusta um prazo processual recebido "cru" de uma API (JusBrasil, webhook
// ou busca ativa) para a data REAL de vencimento, considerando dias sem
// expediente forense — regra do CPC art. 224 §1º: "os prazos somente
// começam a correr em dia de expediente forense e, se o dia do vencimento
// cair em dia sem expediente, prorrogam-se para o próximo dia útil".
//
// Fonte dos bloqueios: tabela public.agenda_blocked_dates (ver migration
// 20260905070000_agenda_bloqueios_feriados.sql) — feriados nacionais e o
// recesso forense (CPC art. 220) já vêm semeados como registros globais
// (user_id null); cada escritório pode complementar com feriados
// estaduais/municipais da própria comarca ou bloqueios pontuais (greve,
// calamidade) específicos da conta dele.
//
// Usado por _shared/pollJusbrasilIntegration.ts (busca ativa) e por
// publication-webhook/index.ts (webhook) antes de gravar
// publications.external_deadline / internal_deadline — assim, o prazo que
// já chega para o advogado na Agenda é o prazo real, não o cru.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

export interface BlockedRange {
  start: string; // yyyy-mm-dd
  end: string; // yyyy-mm-dd
}

// Carrega os bloqueios aplicáveis a um usuário (globais + próprios) numa
// janela de tempo razoável em torno de hoje — não precisamos da tabela
// inteira, só o suficiente para cobrir qualquer prazo plausível recebido
// via API (passado recente até ~2 anos à frente).
export async function loadBlockedRanges(
  adminClient: SupabaseClient,
  userId: string,
): Promise<BlockedRange[]> {
  const { data, error } = await adminClient
    .from("agenda_blocked_dates")
    .select("start_date, end_date")
    .or(`user_id.is.null,user_id.eq.${userId}`);

  if (error) {
    console.error("Error loading agenda_blocked_dates:", error);
    return [];
  }

  return (data ?? []).map((row) => ({ start: row.start_date as string, end: row.end_date as string }));
}

function isWeekend(dateStr: string): boolean {
  // Interpreta a data como "dia civil" (meio-dia UTC) para não sofrer
  // deslocamento de fuso ao pegar getUTCDay().
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function isBlocked(dateStr: string, ranges: BlockedRange[]): boolean {
  if (isWeekend(dateStr)) return true;
  return ranges.some((r) => dateStr >= r.start && dateStr <= r.end);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// CPC art. 224 §1º: prazo que vence em dia sem expediente forense
// prorroga-se para o PRÓXIMO dia útil (nunca antecipa).
export function adjustDeadlineToNextBusinessDay(dateStr: string | null, ranges: BlockedRange[]): string | null {
  if (!dateStr) return null;
  let adjusted = dateStr;
  // Limite de segurança (recesso forense + feriados emendados nunca passam
  // de ~3 semanas seguidas) para nunca entrar num loop indefinido caso os
  // dados de bloqueio estejam corrompidos.
  let guard = 0;
  while (isBlocked(adjusted, ranges) && guard < 60) {
    adjusted = addDays(adjusted, 1);
    guard += 1;
  }
  return adjusted;
}
