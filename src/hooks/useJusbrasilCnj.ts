import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface JusbrasilCnjResponse {
  success: boolean;
  cnj: string;
  provider?: string;
  operation?: string;
  message?: string;
  data?: unknown;
  error?: string;
}

export function useJusbrasilCnj() {
  return useMutation({
    mutationFn: async ({ cnj }: { cnj: string }) => {
      const { data, error } = await supabase.functions.invoke("jusbrasil-cnj", {
        body: { cnj },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as JusbrasilCnjResponse;
    },
  });
}
