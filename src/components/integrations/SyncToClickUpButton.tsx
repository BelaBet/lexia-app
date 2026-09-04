import { useState } from "react";
import { Loader2, ExternalLink, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { 
  useClickUpIntegration, 
  createClickUpTask,
  ClickUpTask 
} from "@/hooks/useClickUp";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface SyncToClickUpButtonProps {
  title: string;
  description?: string;
  dueDate?: string;
  type: "case" | "event";
}

export function SyncToClickUpButton({ 
  title, 
  description, 
  dueDate,
  type 
}: SyncToClickUpButtonProps) {
  const { hasRole } = useAuth();
  const { data: integration } = useClickUpIntegration();
  const [syncing, setSyncing] = useState(false);
  const [syncedTask, setSyncedTask] = useState<ClickUpTask | null>(null);

  const isSupremo = hasRole("supremo");

  if (!isSupremo || !integration?.list_id) {
    return null;
  }

  const handleSync = async () => {
    if (!integration.api_token || !integration.list_id) {
      toast.error("Configure a lista padrão nas integrações");
      return;
    }

    setSyncing(true);

    const taskData: {
      name: string;
      description?: string;
      due_date?: number;
    } = {
      name: `[${type === "case" ? "Processo" : "Evento"}] ${title}`,
    };

    if (description) {
      taskData.description = description;
    }

    if (dueDate) {
      taskData.due_date = new Date(dueDate).getTime();
    }

    const task = await createClickUpTask(
      integration.api_token,
      integration.list_id,
      taskData
    );

    setSyncing(false);

    if (task) {
      setSyncedTask(task);
      toast.success("Sincronizado com ClickUp!");
    } else {
      toast.error("Erro ao sincronizar com ClickUp");
    }
  };

  if (syncedTask) {
    return (
      <a
        href={syncedTask.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-success hover:underline"
      >
        <CheckCircle className="w-3 h-3" />
        Ver no ClickUp
        <ExternalLink className="w-3 h-3" />
      </a>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleSync}
      disabled={syncing}
      className="text-xs h-7"
    >
      {syncing ? (
        <Loader2 className="w-3 h-3 animate-spin mr-1" />
      ) : (
        <svg className="w-3 h-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.514 2.078c.458-.216.975-.216 1.433 0l7.07 3.34c.476.226.783.707.783 1.234v10.696c0 .527-.307 1.008-.783 1.234l-7.07 3.34c-.458.216-.975.216-1.433 0l-7.07-3.34a1.392 1.392 0 01-.783-1.234V6.652c0-.527.307-1.008.783-1.234l7.07-3.34z"/>
        </svg>
      )}
      ClickUp
    </Button>
  );
}
