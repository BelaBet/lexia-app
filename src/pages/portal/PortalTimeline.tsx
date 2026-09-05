import { useOutletContext } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useCaseTimeline } from "@/hooks/useClientPortal";
import type { PortalOutletContext } from "@/hooks/useClientPortal";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Clock } from "lucide-react";

// "O que está acontecendo com meu processo?" — a timeline humanizada completa.
export default function PortalTimeline() {
  const { caseId } = useOutletContext<PortalOutletContext>();
  const { data: timeline, isLoading } = useCaseTimeline(caseId);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-serif font-bold text-foreground">Andamento do processo</h1>
      {!timeline || timeline.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ainda não há atualizações registradas neste processo.</p>
      ) : (
        <ol className="relative border-l border-border ml-2 space-y-6">
          {timeline.map((event) => (
            <li key={event.id} className="ml-5">
              <span className="absolute -left-[7px] mt-1.5 w-3 h-3 rounded-full bg-primary" />
              <p className="text-xs text-muted-foreground mb-0.5">
                {format(new Date(event.event_date + "T00:00:00"), "d 'de' MMMM 'de' yyyy", { locale: ptBR })}
              </p>
              <Card>
                <CardContent className="pt-4">
                  <p className="font-medium text-foreground mb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-primary" /> {event.title}
                  </p>
                  <p className="text-sm text-muted-foreground">{event.client_summary}</p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
