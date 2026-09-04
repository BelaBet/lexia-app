import { FileText, FolderOpen, Clock, CheckCircle } from "lucide-react";
import { useDocuments } from "@/hooks/useDocuments";
import { useCases } from "@/hooks/useCases";
import { useEvents } from "@/hooks/useEvents";

export function StatsCards() {
  const { data: documents = [] } = useDocuments();
  const { data: cases = [] } = useCases();
  const { data: events = [] } = useEvents();

  // "Processos Abertos" = casos ainda não encerrados (status diferente de
  // "closed"), refletindo os dados de cada caso puxados via API de
  // monitoramento de processos (JusBrasil/WebJur/Escavador) de cada empresa.
  const openCases = cases.filter((c) => c.status !== "closed").length;
  // "Processo Baixado" = casos com baixa/encerramento no tribunal
  // (status "closed"), mesma origem de dados.
  const archivedCases = cases.filter((c) => c.status === "closed").length;
  
  const today = new Date();
  const upcomingEvents = events.filter((e) => {
    const eventDate = new Date(e.event_date);
    const diffDays = Math.ceil((eventDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 7;
  }).length;

  const nextDeadline = events
    .filter((e) => e.type === "deadline" && new Date(e.event_date) >= today)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())[0];

  const nextDeadlineDays = nextDeadline
    ? Math.ceil((new Date(nextDeadline.event_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
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
    },
    {
      label: "Processos Abertos",
      value: openCases.toString(),
      icon: FolderOpen,
      change: cases.length > 0 ? `${cases.length} total` : "Nenhum ainda",
      color: "text-gold-warm",
    },
    {
      label: "Prazos Próximos",
      value: upcomingEvents.toString(),
      icon: Clock,
      change: nextDeadlineDays !== null ? `Próximo: ${nextDeadlineDays} dias` : "Sem prazos",
      color: "text-warning",
    },
    {
      label: "Processo Baixado",
      value: archivedCases.toString(),
      icon: CheckCircle,
      change: "Encerrados no tribunal",
      color: "text-success",
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
            <p className="stat-value">{stat.value}</p>
            <p className="stat-label">{stat.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
