import { Calendar, AlertCircle, CheckSquare, Clock } from "lucide-react";
import { useEvents } from "@/hooks/useEvents";
import { useChecklists } from "@/hooks/useChecklists";
import { format, differenceInDays, startOfDay, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const priorityStyles: Record<string, string> = {
  high: "border-l-destructive bg-destructive/5",
  medium: "border-l-warning bg-warning/5",
  low: "border-l-success bg-success/5",
  urgent: "border-l-destructive bg-destructive/10",
};

interface DeadlineItem {
  id: string;
  title: string;
  date: Date;
  daysLeft: number;
  priority: "high" | "medium" | "low" | "urgent";
  type: "event" | "checklist";
  time?: string;
}

interface UpcomingDeadlinesProps {
  onTabChange?: (tab: string) => void;
}

export function UpcomingDeadlines({ onTabChange }: UpcomingDeadlinesProps) {
  const { data: events = [], isLoading: isLoadingEvents } = useEvents();
  const { data: checklists = [], isLoading: isLoadingChecklists } = useChecklists();
  
  const today = startOfDay(new Date());

  // Convert events to deadlines
  const eventDeadlines: DeadlineItem[] = events
    .filter((e) => {
      const eventDate = startOfDay(parseISO(e.event_date));
      return eventDate >= today;
    })
    .map((e) => {
      const eventDate = startOfDay(parseISO(e.event_date));
      const daysLeft = differenceInDays(eventDate, today);
      let priority: "high" | "medium" | "low" = "low";
      if (daysLeft <= 2) priority = "high";
      else if (daysLeft <= 5) priority = "medium";
      
      return {
        id: e.id,
        title: e.title,
        date: eventDate,
        daysLeft,
        priority,
        type: "event" as const,
        time: e.event_time,
      };
    });

  // Convert checklists to deadlines
  const checklistDeadlines: DeadlineItem[] = checklists
    .filter((c) => c.due_date && c.status !== "completed" && c.status !== "cancelled")
    .filter((c) => {
      const dueDate = startOfDay(parseISO(c.due_date!));
      return dueDate >= today;
    })
    .map((c) => {
      const dueDate = startOfDay(parseISO(c.due_date!));
      const daysLeft = differenceInDays(dueDate, today);
      let priority = c.priority as "high" | "medium" | "low" | "urgent";
      // Override priority based on urgency
      if (daysLeft <= 1 && priority !== "urgent") priority = "high";
      
      return {
        id: c.id,
        title: c.title,
        date: dueDate,
        daysLeft,
        priority,
        type: "checklist" as const,
      };
    });

  // Combine and sort by date
  const allDeadlines = [...eventDeadlines, ...checklistDeadlines]
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 6);

  const isLoading = isLoadingEvents || isLoadingChecklists;

  if (isLoading) {
    return (
      <div className="legal-card">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-serif text-xl font-semibold">Próximos Prazos</h3>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-4 rounded-lg border-l-4 border-muted bg-muted/30 animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="legal-card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-serif text-xl font-semibold">Próximos Prazos</h3>
        {allDeadlines.length > 4 && (
          <button
            onClick={() => onTabChange?.("calendar")}
            className="text-sm text-gold-warm hover:text-gold-dark transition-colors"
          >
            Ver agenda
          </button>
        )}
      </div>

      {allDeadlines.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum prazo próximo</p>
          <p className="text-sm">Adicione eventos ou checklists</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allDeadlines.map((deadline, index) => (
            <div 
              key={`${deadline.type}-${deadline.id}`}
              className={`p-4 rounded-lg border-l-4 ${priorityStyles[deadline.priority]} fade-in`}
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {deadline.type === "checklist" ? (
                      <CheckSquare className="w-4 h-4 text-primary flex-shrink-0" />
                    ) : (
                      <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <span className="text-xs text-muted-foreground uppercase">
                      {deadline.type === "checklist" ? "Checklist" : "Evento"}
                    </span>
                  </div>
                  <p className="font-medium text-foreground truncate">{deadline.title}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {format(deadline.date, "dd MMM", { locale: ptBR })}
                    </span>
                    {deadline.time && (
                      <span className="text-sm text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {deadline.time}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 text-sm ml-2 flex-shrink-0">
                  {deadline.daysLeft <= 3 && (
                    <AlertCircle className="w-4 h-4 text-destructive" />
                  )}
                  <span className={deadline.daysLeft <= 3 ? "text-destructive font-medium" : "text-muted-foreground"}>
                    {deadline.daysLeft === 0 ? "Hoje" : `${deadline.daysLeft}d`}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
