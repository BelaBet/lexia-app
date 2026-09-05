import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Dados de demonstração: linhas marcadas com is_demo = true nas próprias
// tabelas (cases/events/checklists/publications/documents) — ver migração
// 20260905060000_demo_data_schema. Este hook só precisa saber SE existe
// alguma (para mostrar o aviso no topo) e, quando pedido, apagar tudo de
// uma vez via a função de banco delete_demo_data() (SECURITY DEFINER,
// sempre restrita a auth.uid() — nunca apaga dado de outra conta).
export function useHasDemoData() {
  return useQuery({
    queryKey: ["has-demo-data"],
    queryFn: async () => {
      const tables = ["cases", "events", "checklists", "publications", "documents"] as const;
      const results = await Promise.all(
        tables.map((table) =>
          supabase.from(table).select("id", { count: "exact", head: true }).eq("is_demo", true),
        ),
      );
      const total = results.reduce((sum, r) => sum + (r.count || 0), 0);
      return total > 0;
    },
  });
}

export function useDeleteDemoData() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("delete_demo_data");
      if (error) throw error;
      return data as { table_name: string; deleted_count: number }[];
    },
    onSuccess: (rows) => {
      const total = (rows || []).reduce((sum, r) => sum + Number(r.deleted_count || 0), 0);
      queryClient.invalidateQueries({ queryKey: ["has-demo-data"] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
      queryClient.invalidateQueries({ queryKey: ["events"] });
      queryClient.invalidateQueries({ queryKey: ["checklists"] });
      queryClient.invalidateQueries({ queryKey: ["publications"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      toast.success(`Dados de demonstração removidos (${total} registros).`);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Erro ao apagar dados de demonstração");
    },
  });
}
