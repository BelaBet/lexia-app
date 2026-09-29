import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { format, isPast, isToday, differenceInDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";
import {
  Publication,
  PublicationStatus,
  PipelineStage,
  PIPELINE_STAGES,
  useUpdatePublicationStage,
} from "@/hooks/usePublications";

const statusConfig: Record<PublicationStatus, { label: string; color: string }> = {
  pending: { label: "Pendente", color: "bg-yellow-500/10 text-yellow-600" },
  in_progress: { label: "Em Andamento", color: "bg-blue-500/10 text-blue-600" },
  completed: { label: "Concluído", color: "bg-green-500/10 text-green-600" },
  overdue: { label: "Atrasado", color: "bg-red-500/10 text-red-600" },
  cancelled: { label: "Cancelado", color: "bg-gray-500/10 text-gray-600" },
};

function deadlineBadge(date: string | null) {
  if (!date) return null;
  const d = parseISO(date);
  const label = format(d, "dd/MM/yyyy", { locale: ptBR });
  if (isPast(d) && !isToday(d)) return <span className="text-red-600 font-medium">{label}</span>;
  if (isToday(d)) return <span className="text-red-600 font-medium">{label} (hoje)</span>;
  if (differenceInDays(d, new Date()) <= 3) return <span className="text-orange-600 font-medium">{label}</span>;
  return <span>{label}</span>;
}

interface PublicationKanbanProps {
  publications: Publication[];
}

export function PublicationKanban({ publications }: PublicationKanbanProps) {
  const navigate = useNavigate();
  const updateStage = useUpdatePublicationStage();

  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, Publication[]>();
    for (const stage of PIPELINE_STAGES) map.set(stage.value, []);
    for (const pub of publications) {
      const list = map.get(pub.pipeline_stage);
      if (list) list.push(pub);
      else map.set(pub.pipeline_stage, [pub]);
    }
    return map;
  }, [publications]);

  return (
    <div className="flex gap-4 overflow-x-auto pb-2">
      {PIPELINE_STAGES.map((stage) => {
        const items = byStage.get(stage.value) || [];
        return (
          <div key={stage.value} className="w-80 shrink-0">
            <div className="flex items-center justify-between mb-2 px-1">
              <p className="text-sm font-semibold">{stage.label}</p>
              <Badge variant="outline" className="text-xs">{items.length}</Badge>
            </div>
            <div className="space-y-2 min-h-[80px]">
              {items.map((pub) => (
                <Card
                  key={pub.id}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => navigate(`/publicacoes/${pub.id}`, { state: { from: "publications" } })}
                >
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {pub.process_number || "Sem número"}
                      </span>
                      <Badge className={cn("text-[10px] border-0", statusConfig[pub.status].color)}>
                        {statusConfig[pub.status].label}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{pub.content}</p>
                    {pub.external_deadline && (
                      <p className="text-[11px] text-muted-foreground">
                        Prazo externo: {deadlineBadge(pub.external_deadline)}
                      </p>
                    )}
                    <div onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={pub.pipeline_stage}
                        onValueChange={(value) => updateStage.mutate({ id: pub.id, pipeline_stage: value as PipelineStage })}
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PIPELINE_STAGES.map((s) => (
                            <SelectItem key={s.value} value={s.value} className="text-xs">{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardContent>
                </Card>
              ))}
              {items.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-6 border border-dashed rounded-lg">
                  Nenhuma publicação
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
