import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface NameVariationPreview {
  name: string;
  total: number;
  variation_id: number | null;
  checked: boolean;
}

export interface NamePartPreview {
  id: number | null;
  name: string;
  checked: boolean;
  total: number;
  variations: NameVariationPreview[];
}

export interface NameSearchPreviewResponse {
  success: boolean;
  report_id: string;
  provider_report_id: string;
  search_name: string;
  total_procs: number;
  estimated_cost: number;
  parts: NamePartPreview[];
  message: string;
}

async function invoke<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const context = (error as { context?: { json?: () => Promise<unknown> } }).context;
    let message: string | null = null;
    if (context?.json) {
      try {
        const parsed = await context.json() as { error?: string; detail?: string };
        message = parsed.error || parsed.detail || null;
      } catch {
        // fallback abaixo
      }
    }
    throw new Error(message || error.message || "Erro ao consultar o JusBrasil");
  }
  return data as T;
}

export function usePreviewNameSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => invoke<NameSearchPreviewResponse>("preview-name-search", { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["process-search", "reports"] }),
  });
}

export function useConfirmNameSearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ reportId, excludedVariationIds }: { reportId: string; excludedVariationIds: Array<number | null> }) =>
      invoke<{ success: boolean; report_id: string; no_results?: boolean; message: string }>("confirm-name-search", {
        report_id: reportId,
        confirm_charge: true,
        excluded_variation_ids: excludedVariationIds,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["process-search", "reports"] }),
  });
}
