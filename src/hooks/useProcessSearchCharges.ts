import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Contador financeiro de pesquisas processuais: cada busca ativa
// (poll-jusbrasil, agendada 1x/dia) e cada busca manual disparada pelo
// usuário na tela de Integrações grava um registro aqui, com o valor
// cobrado do cliente (CNPJ/CPF monitorado) configurado em
// publication_integrations.price_per_search.

export type SearchType = "manual" | "poll";
export type DocumentType = "cpf" | "cnpj" | "oab" | "outro";

export interface ProcessSearchCharge {
  id: string;
  user_id: string;
  integration_id: string | null;
  source: string;
  document: string;
  document_type: DocumentType;
  search_type: SearchType;
  unit_price: number;
  charged_amount: number;
  created_at: string;
}

export interface ProcessSearchDocumentSummary {
  document: string;
  document_type: DocumentType;
  source: string;
  totalSearches: number;
  manualSearches: number;
  pollSearches: number;
  totalCharged: number;
  lastSearchAt: string;
}

export function useProcessSearchCharges() {
  return useQuery({
    queryKey: ["process_search_charges"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("process_search_charges")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as ProcessSearchCharge[];
    },
  });
}

// Agrupa os registros por CNPJ/CPF (ou OAB) monitorado, somando quantidade
// de pesquisas e valor total cobrado — é essa visão agregada que aparece na
// tela de Financeiro.
export function summarizeByDocument(charges: ProcessSearchCharge[]): ProcessSearchDocumentSummary[] {
  const byDocument = new Map<string, ProcessSearchDocumentSummary>();

  for (const charge of charges) {
    const key = `${charge.source}:${charge.document}`;
    const existing = byDocument.get(key);
    if (existing) {
      existing.totalSearches += 1;
      if (charge.search_type === "manual") existing.manualSearches += 1;
      else existing.pollSearches += 1;
      existing.totalCharged += Number(charge.charged_amount);
      if (charge.created_at > existing.lastSearchAt) existing.lastSearchAt = charge.created_at;
    } else {
      byDocument.set(key, {
        document: charge.document,
        document_type: charge.document_type,
        source: charge.source,
        totalSearches: 1,
        manualSearches: charge.search_type === "manual" ? 1 : 0,
        pollSearches: charge.search_type === "poll" ? 1 : 0,
        totalCharged: Number(charge.charged_amount),
        lastSearchAt: charge.created_at,
      });
    }
  }

  return Array.from(byDocument.values()).sort((a, b) => b.totalCharged - a.totalCharged);
}
