import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface JusbrasilCnjResponse {
  success: boolean;
  dry_run: boolean;
  cnj: string;
  provider?: string;
  operation?: string;
  request?: { method: string; url: string };
  message?: string;
  data?: unknown;
  error?: string;
}

export function useJusbrasilCnj() {
  return useMutation({
    mutationFn: async ({ cnj, dryRun = true }: { cnj: string; dryRun?: boolean }) => {
      const { data, error } = await supabase.functions.invoke("jusbrasil-cnj", {
        body: { cnj, dry_run: dryRun },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as JusbrasilCnjResponse;
    },
  });
}
