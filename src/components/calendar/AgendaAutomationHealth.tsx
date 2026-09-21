import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type HealthRow = {
  automation_key: string;
  status: "ok" | "warning" | "error";
  last_success_at: string | null;
  updated_at: string;
};

export function AgendaAutomationHealth() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["agenda-automation-health"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_health")
        .select("automation_key,status,last_success_at,updated_at")
        .in("automation_key", ["event_notifications", "process_agenda_sync"]);
      if (error) throw error;
      return (data || []) as HealthRow[];
    },
    refetchInterval: 60_000,
  });

  if (isLoading) return null;

  const now = Date.now();
  const healthy = ["event_notifications", "process_agenda_sync"].every((key) => {
    const row = data.find((item) => item.automation_key === key);
    const last = row?.last_success_at ? new Date(row.last_success_at).getTime() : 0;
    return row?.status === "ok" && now - last < 25 * 60 * 1000;
  });

  const lastSuccess = data
    .map((row) => row.last_success_at)
    .filter(Boolean)
    .map((value) => new Date(value as string).getTime())
    .sort((a, b) => b - a)[0];

  if (!healthy) {
    return (
      <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-warning/10 text-warning" title="A automação da Agenda precisa de verificação">
        <AlertTriangle className="w-4 h-4" />
        <span>Verificar automação da Agenda</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-success/10 text-success" title={lastSuccess ? `Última verificação automática: ${new Date(lastSuccess).toLocaleString("pt-BR")}` : undefined}>
      <CheckCircle2 className="w-4 h-4" />
      <span>Lembretes e sincronização operacionais</span>
    </div>
  );
}
