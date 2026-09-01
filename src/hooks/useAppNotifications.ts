import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Notificações in-app persistidas no banco (tabela `notifications`) — hoje
// usadas para avisar quando uma nova publicação é importada automaticamente
// via webhook (JusBrasil/WebJur). Não confundir com o hook `useNotifications`
// (notificações nativas do navegador para lembretes de eventos da agenda).

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string | null;
  link_tab: string | null;
  is_read: boolean;
  created_at: string;
}

export function useAppNotifications() {
  return useQuery({
    queryKey: ["app_notifications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    // Sem realtime configurado no front — refresh periódico para pegar
    // publicações importadas automaticamente em segundo plano.
    refetchInterval: 60_000,
  });
}

export function useMarkAppNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_notifications"] });
    },
  });
}

export function useMarkAllAppNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_notifications"] });
    },
  });
}
