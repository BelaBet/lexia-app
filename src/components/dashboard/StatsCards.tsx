import { FileText, FolderOpen, Clock, CheckCircle } from "lucide-react";
import { useDocuments } from "@/hooks/useDocuments";
import { useCases } from "@/hooks/useCases";
import { useEvents } from "@/hooks/useEvents";
import { parseISO, startOfDay, differenceInCalendarDays } from "date-fns";

// Tipos de evento que contam como "prazo" para o card de Prazos Próximos —
// inclui os prazos processuais criados automaticamente a partir de
// publicações (externo/interno), além do tipo genérico "deadline".
const DEADLINE_EVENT_TYPES = new Set(["deadline", "prazo_externo", "prazo_interno"]);

export function StatsCards() {
  const { data: documents = [] } = useDocuments();
  const { data: cases = [] } = useCases();
  const { data: events = [] } = useEvents();

  // "Processos Abertos" = casos ainda não encerrados (status diferente de
  // "closed"), refletindo os dados de cada caso puxados via API de
  // monitoramento de processos (JusBrasil/WebJur/Escavador) de cada empresa.
  const openCases = cases.filter((c) => c.status !== "closed").length;
  // "Processos Baixados" = casos com baixa/encerramento no tribunal
  // (status "closed"), mesma origem de dados.
  const archivedCases = cases.filter((c) => c.status === "closed").length;
  
  // event_date é uma coluna DATE (sem timezone) — usar parseISO em vez de
  // `new Date(string)` evita que o dia mude por causa do fuso horário local
  // (Brasil é UTC-3, então `new Date("2026-09-10")` vira 09/09 à noite aqui).
  const today = startOfDay(new Date());
  const upcomingEvents = events.filter((e) => {
    const diffDays = differenceInCalendarDays(parseISO(e.event_date), today);
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  const nextDeadline = events
    .filter((e) => DEADLINE_EVENT_TYPES.has(e.type) && differenceInCalendarDays(parseISO(e.event_date), today) >= 0)
    .sort((a, b) => parseISO(a.event_date).getTime() - parseISO(b.event_date).getTime())[0];

  const nextDeadlineDays = nextDeadline
    ? differenceInCalendarDays(parseISO(nextDeadline.event_date), today)
    : null;

  const stats = [
    {
      label: "Documentos",
      value: documents.length.toString(),
      icon: FileText,
      change: documents.length > 0 ? `${documents.filter(d => {
        const created = new Date(d.created_at);
        const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        return created >= weekAgo;
      }).length} esta semana` : "Nenhum ainda",
      color: "text-primary",
      valueColor: "",
    },
    {
      label: "Processos Abertos",
      value: openCases.toString(),
      icon: FolderOpen,
      change: cases.length > 0 ? `${cases.length} total` : "Nenhum ainda",
      color: "text-green-400",
      valueColor: "text-green-400",
    },
    {
      label: "Prazos Próximos",
      value: upcomingEvents.toString(),
      icon: Clock,
      change: nextDeadlineDays !== null ? `Próximo: ${nextDeadlineDays} dias` : "Sem prazos",
      color: "text-red-600",
      valueColor: "text-red-600",
    },
    {
      label: "Processos Baixados",
      value: archivedCases.toString(),
      icon: CheckCircle,
      change: "Encerrados no tribunal",
      color: "text-purple-900",
      valueColor: "text-purple-900",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <div 
          key={stat.label} 
          className="stat-card fade-in"
          style={{ animationDelay: `${index * 100}ms` }}
        >
          <div className="flex items-center justify-between">
            <stat.icon className={`w-8 h-8 ${stat.color}`} />
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {stat.change}
            </span>
          </div>
          <div className="mt-4">
            <p className={`stat-value ${stat.valueColor}`}>{stat.value}</p>
            <p className="stat-label">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
