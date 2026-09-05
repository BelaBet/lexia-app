import { useState, useRef, useEffect, useMemo } from "react";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Clock,
  MapPin,
  X,
  Users,
  Link2,
  Bell,
  BellOff,
  BellRing,
  Upload,
  Trash2,
  Send,
  FileText,
  Pencil,
  Lock,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Scale,
  List as ListIcon,
  LayoutGrid,
  ExternalLink,
} from "lucide-react";
import {
  useEvents,
  useCreateEvent,
  useDeleteEvent,
  useUpdateEvent,
  useToggleEventStatus,
  useSendInvites,
  isApiCreatedEvent,
  getTodayDateStr,
  isRetroactiveEventDateChange,
  CalendarEvent,
  CreateEventData,
  UpdateEventData,
  EventTaskStatus,
} from "@/hooks/useEvents";
import { useChecklists } from "@/hooks/useChecklists";
import { useCases } from "@/hooks/useCases";
import { useNotifications } from "@/hooks/useNotifications";
import { openGoogleCalendar, downloadICS } from "@/lib/calendarExport";
import { SyncToClickUpButton } from "@/components/integrations/SyncToClickUpButton";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday, startOfDay, parseISO, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

// Os 6 tipos do "Calendário Jurídico de Processos": Prazo, Audiência,
// Tarefa, Procedimento, Reunião e Evento processual. "prazo_externo" e
// "prazo_interno" continuam existindo como subtipos automáticos (criados
// pela integração com o JusBrasil — ver syncDeadlineEvents no backend) para
// distinguir prazo de resposta (externo) de prazo de controle interno do
// escritório; "deadline" é o mesmo grupo "Prazo" quando criado manualmente.
const eventTypeConfig = {
  hearing: { label: "Audiência", class: "bg-primary/10 text-primary border-l-primary" },
  deadline: { label: "Prazo", class: "bg-destructive/10 text-destructive border-l-destructive" },
  meeting: { label: "Reunião", class: "bg-success/10 text-success border-l-success" },
  tarefa: { label: "Tarefa", class: "bg-indigo-500/10 text-indigo-600 border-l-indigo-500" },
  procedimento: { label: "Procedimento", class: "bg-amber-500/10 text-amber-600 border-l-amber-500" },
  evento_processual: { label: "Evento Processual", class: "bg-cyan-500/10 text-cyan-600 border-l-cyan-500" },
  prazo_externo: { label: "Prazo Externo (Publicação)", class: "bg-destructive/10 text-destructive border-l-destructive" },
  prazo_interno: { label: "Prazo Interno (Publicação)", class: "bg-warning/10 text-warning border-l-warning" },
};

const eventDotColor: Record<string, string> = {
  hearing: "bg-primary",
  deadline: "bg-destructive",
  meeting: "bg-success",
  tarefa: "bg-indigo-500",
  procedimento: "bg-amber-500",
  evento_processual: "bg-cyan-500",
  prazo_externo: "bg-destructive",
  prazo_interno: "bg-warning",
};

// Agrupamento usado pelos chips de filtro da Agenda — "Prazos" reúne os 3
// subtipos de prazo (manual + os 2 que chegam automaticamente via API) num
// só filtro, já que para quem está olhando a agenda o que importa é "isto
// é um prazo", não qual sistema o criou.
type AgendaFilterKey = "todos" | "prazos" | "audiencias" | "tarefas" | "reunioes" | "procedimentos" | "criticos" | "sem_processo";

const filterTypeGroups: Record<Exclude<AgendaFilterKey, "todos" | "criticos" | "sem_processo">, string[]> = {
  prazos: ["deadline", "prazo_externo", "prazo_interno"],
  audiencias: ["hearing"],
  tarefas: ["tarefa"],
  reunioes: ["meeting"],
  procedimentos: ["procedimento", "evento_processual"],
};

const agendaFilterLabels: Record<AgendaFilterKey, string> = {
  todos: "Todos",
  prazos: "Prazos",
  audiencias: "Audiências",
  tarefas: "Tarefas",
  reunioes: "Reuniões",
  procedimentos: "Procedimentos",
  criticos: "Críticos",
  sem_processo: "Sem processo",
};

// Considerado "crítico" para o banner de risco: prazo/audiência que vence
// dentro desta janela (em dias corridos) e ainda não foi concluído/cancelado.
const CRITICAL_WINDOW_DAYS = 3;

function describeDueDate(dateStr: string): string {
  const days = differenceInCalendarDays(startOfDay(parseISO(dateStr)), startOfDay(new Date()));
  if (days < 0) return `venceu há ${Math.abs(days)} dia${Math.abs(days) === 1 ? "" : "s"}`;
  if (days === 0) return "vence hoje";
  if (days === 1) return "vence amanhã";
  return `vence em ${days} dias`;
}

const taskStatusConfig: Record<string, { label: string; class: string }> = {
  pending: { label: "Pendente", class: "bg-warning/10 text-warning" },
  in_progress: { label: "Em Andamento", class: "bg-primary/10 text-primary" },
  completed: { label: "Concluído", class: "bg-success/10 text-success" },
  overdue: { label: "Atrasado", class: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelado", class: "bg-muted text-muted-foreground" },
};

const eventTitleClass = (event: CalendarEvent) =>
  event.status === "completed" ? "line-through text-red-600 decoration-red-600" : "";

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface Participant {
  name: string;
  email: string;
}

interface CalendarViewProps {
  /** Navega até "Processos" já com o processo aberto — usado pelo botão "Abrir processo" nos itens da Agenda. */
  onOpenCase?: (caseId: string) => void;
}

export function CalendarView({ onOpenCase }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayDetailsFilter, setDayDetailsFilter] = useState<"all" | "events" | "checklists">("all");
  const [viewMode, setViewMode] = useState<"mes" | "lista">("mes");
  const [activeFilter, setActiveFilter] = useState<AgendaFilterKey>("todos");
  const [newEvent, setNewEvent] = useState<CreateEventData>({
    title: "",
    description: "",
    event_date: format(new Date(), "yyyy-MM-dd"),
    event_time: "09:00",
    type: "meeting",
    location: "",
    meeting_link: "",
    notification_enabled: false,
    notification_minutes_before: 30,
    case_id: undefined,
    participants: [],
    files: [],
  });
  const [newParticipant, setNewParticipant] = useState<Participant>({ name: "", email: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [editForm, setEditForm] = useState<UpdateEventData>({ id: "" });

  const { data: events = [], isLoading } = useEvents();
  const { data: checklists = [] } = useChecklists();
  const { data: cases = [] } = useCases();

  const casesById = useMemo(() => new Map(cases.map((c) => [c.id, c])), [cases]);

  // Item da agenda passa no filtro ativo? "Críticos" e "Sem processo" olham
  // o evento inteiro (data/vínculo), os demais só o tipo.
  const matchesFilter = (event: CalendarEvent, filter: AgendaFilterKey): boolean => {
    if (filter === "todos") return true;
    if (filter === "criticos") {
      if (event.computed_status === "completed" || event.computed_status === "cancelled") return false;
      const days = differenceInCalendarDays(startOfDay(parseISO(event.event_date)), startOfDay(new Date()));
      return days <= CRITICAL_WINDOW_DAYS;
    }
    if (filter === "sem_processo") return !event.case_id;
    return filterTypeGroups[filter].includes(event.type);
  };

  // Processos que a Agenda "esqueceu": nenhum item futuro (prazo, audiência,
  // tarefa etc.) vinculado a eles. É o "Processo X ainda não possui tarefa
  // atribuída" do conceito de Calendário Jurídico — hoje isso não aparecia
  // em lugar nenhum do produto.
  const casesWithoutUpcomingItem = useMemo(() => {
    const today = startOfDay(new Date());
    const casesWithFutureItem = new Set(
      events
        .filter((e) => e.case_id && startOfDay(parseISO(e.event_date)) >= today && e.computed_status !== "cancelled")
        .map((e) => e.case_id as string),
    );
    return cases.filter((c) => c.status !== "closed" && !casesWithFutureItem.has(c.id));
  }, [cases, events]);

  const criticalEvents = useMemo(
    () => events.filter((e) => matchesFilter(e, "criticos")),
    [events],
  );
  // Update event date to today when dialog opens
  useEffect(() => {
    if (isDialogOpen) {
      setNewEvent((prev) => ({
        ...prev,
        event_date: format(new Date(), "yyyy-MM-dd"),
      }));
    }
  }, [isDialogOpen]);

  // Reset filter when a new day is selected
  useEffect(() => {
    if (selectedDay) {
      setDayDetailsFilter("all");
    }
  }, [selectedDay]);
  const createEvent = useCreateEvent();
  const deleteEvent = useDeleteEvent();
  const updateEvent = useUpdateEvent();
  const toggleEventStatus = useToggleEventStatus();
  const sendInvites = useSendInvites();
  const { 
    requestPermission, 
    scheduleAllNotifications, 
    isSupported: notificationsSupported,
    permission: notificationPermission 
  } = useNotifications();

  // Schedule notifications when events change
  useEffect(() => {
    if (events.length > 0 && notificationPermission === "granted") {
      scheduleAllNotifications(events);
    }
  }, [events, scheduleAllNotifications, notificationPermission]);

  const handleEnableNotifications = async () => {
    const granted = await requestPermission();
    if (granted && events.length > 0) {
      scheduleAllNotifications(events);
      toast.success("Notificações ativadas! Você receberá lembretes dos eventos.");
    }
  };

  const getDaysInMonth = () => {
    const start = startOfMonth(currentDate);
    const end = endOfMonth(currentDate);
    const days = eachDayOfInterval({ start, end });
    
    const startDay = getDay(start);
    const paddedDays: (Date | null)[] = [];
    
    for (let i = 0; i < startDay; i++) {
      paddedDays.push(null);
    }
    
    return [...paddedDays, ...days];
  };

  const getEventsForDay = (day: Date) => {
    return events.filter((e) => isSameDay(parseISO(e.event_date), day));
  };

  const getChecklistsForDay = (day: Date) => {
    return checklists.filter((c) => 
      c.due_date && isSameDay(parseISO(c.due_date), day) && 
      c.status !== "completed" && c.status !== "cancelled"
    );
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const handleAddParticipant = () => {
    if (!newParticipant.name || !newParticipant.email) {
      toast.error("Preencha nome e email do participante");
      return;
    }
    
    if (!newParticipant.email.includes("@")) {
      toast.error("Email inválido");
      return;
    }

    setNewEvent({
      ...newEvent,
      participants: [...(newEvent.participants || []), { ...newParticipant }],
    });
    setNewParticipant({ name: "", email: "" });
  };

  const handleRemoveParticipant = (index: number) => {
    const updated = [...(newEvent.participants || [])];
    updated.splice(index, 1);
    setNewEvent({ ...newEvent, participants: updated });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const fileArray = Array.from(files);
      setNewEvent({
        ...newEvent,
        files: [...(newEvent.files || []), ...fileArray],
      });
    }
  };

  const handleRemoveFile = (index: number) => {
    const updated = [...(newEvent.files || [])];
    updated.splice(index, 1);
    setNewEvent({ ...newEvent, files: updated });
  };

  const generateMeetingLink = () => {
    const roomId = Math.random().toString(36).substring(2, 15);
    const link = `https://meet.jit.si/lexia-${roomId}`;
    setNewEvent({ ...newEvent, meeting_link: link });
    toast.success("Link de reunião gerado!");
  };

  const handleCreateEvent = async () => {
    if (!newEvent.title || !newEvent.event_date || !newEvent.event_time) return;
    if (isRetroactiveEventDateChange(newEvent.event_date)) {
      toast.error("Não é possível criar eventos em datas passadas.");
      return;
    }

    await createEvent.mutateAsync(newEvent);
    setNewEvent({
      title: "",
      description: "",
      event_date: format(new Date(), "yyyy-MM-dd"),
      event_time: "09:00",
      type: "meeting",
      location: "",
      meeting_link: "",
      notification_enabled: false,
      notification_minutes_before: 30,
      case_id: undefined,
      participants: [],
      files: [],
    });
    setIsDialogOpen(false);
  };

  const handleSendInvites = async (event: CalendarEvent) => {
    if (!event.participants || event.participants.length === 0) {
      toast.error("Este evento não possui participantes");
      return;
    }

    const pendingParticipants = event.participants.filter((p) => !p.invite_sent);
    if (pendingParticipants.length === 0) {
      toast.info("Todos os convites já foram enviados");
      return;
    }

    await sendInvites.mutateAsync({ eventId: event.id, participants: pendingParticipants });
  };

  const copyMeetingLink = (link: string) => {
    navigator.clipboard.writeText(link);
    toast.success("Link copiado para a área de transferência!");
  };

  const openEditDialog = (event: CalendarEvent) => {
    setEditingEvent(event);
    setEditForm({
      id: event.id,
      title: event.title,
      description: event.description || "",
      event_date: event.event_date,
      event_time: event.event_time,
      type: event.type,
      location: event.location || "",
      meeting_link: event.meeting_link || "",
      notification_enabled: event.notification_enabled,
      notification_minutes_before: event.notification_minutes_before || 30,
      status: event.status || undefined,
      case_id: event.case_id || undefined,
    });
  };

  const handleUpdateEvent = async () => {
    if (!editForm.title || !editForm.event_date || !editForm.event_time) return;
    if (isRetroactiveEventDateChange(editForm.event_date, editingEvent?.event_date)) {
      toast.error("Não é possível mover o evento para uma data passada.");
      return;
    }
    await updateEvent.mutateAsync(editForm);
    setEditingEvent(null);
  };

  const handleToggleCompleted = (event: CalendarEvent) => {
    toggleEventStatus.mutate({
      id: event.id,
      status: event.status === "completed" ? "pending" : "completed",
    });
  };

  const days = getDaysInMonth();

  const today = startOfDay(new Date());
  // Valor mínimo dos inputs de data (regra de evento retroativo — ver
  // isRetroactiveEventDateChange em useEvents.ts, a mesma fonte de verdade
  // usada na validação de submit e espelhada no gatilho do banco).
  const todayDateStr = getTodayDateStr();
  const upcomingEventsFiltered = events
    .filter((e) => startOfDay(parseISO(e.event_date)) >= today)
    .filter((e) => matchesFilter(e, activeFilter))
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());
  // No filtro padrão ("Todos") mantemos a lista curta de sempre; com um
  // filtro específico ativo, faz sentido mostrar mais itens (é para isso
  // que a pessoa filtrou).
  const upcomingEvents = upcomingEventsFiltered.slice(0, activeFilter === "todos" ? 5 : 30);

  const upcomingChecklists = checklists
    .filter((c) => c.due_date && c.status !== "completed" && c.status !== "cancelled")
    .filter((c) => startOfDay(parseISO(c.due_date!)) >= today)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 3);

  const pastEvents = events
    .filter((e) => startOfDay(parseISO(e.event_date)) < today)
    .sort((a, b) => parseISO(b.event_date).getTime() - parseISO(a.event_date).getTime())
    .slice(0, 10);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="legal-card">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-semibold">Agenda</h2>
              <p className="text-muted-foreground">Compromissos e prazos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {notificationsSupported && notificationPermission !== "granted" && (
              <button 
                onClick={handleEnableNotifications}
                className="legal-button-secondary flex items-center gap-2"
                title="Habilitar notificações"
              >
                <BellOff className="w-5 h-5" />
                Ativar Notificações
              </button>
            )}
            {notificationPermission === "granted" && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-3 py-2 bg-success/10 rounded-lg">
                <BellRing className="w-4 h-4 text-success" />
                <span className="text-success">Notificações ativas</span>
              </div>
            )}
            <button 
              onClick={() => setIsDialogOpen(true)}
              className="legal-button-primary flex items-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Novo Evento
            </button>
          </div>
        </div>
      </div>

      {/* Banner de risco: prazos críticos e processos sem item vinculado — a
          Agenda funcionando como gerenciador de risco jurídico, não só como
          lista de compromissos. */}
      {(criticalEvents.length > 0 || casesWithoutUpcomingItem.length > 0) && (
        <div className="legal-card border-l-4 border-l-destructive bg-destructive/5">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-2 min-w-0">
              <p className="font-medium text-sm">
                {criticalEvents.length + casesWithoutUpcomingItem.length} atividade
                {criticalEvents.length + casesWithoutUpcomingItem.length === 1 ? "" : "s"} exigem atenção
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {criticalEvents.length > 0 && (
                  <button
                    onClick={() => setActiveFilter("criticos")}
                    className="px-2 py-1 rounded-full bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                  >
                    {criticalEvents.length} prazo{criticalEvents.length === 1 ? "" : "s"}/compromisso
                    {criticalEvents.length === 1 ? "" : "s"} crítico{criticalEvents.length === 1 ? "" : "s"} (≤ {CRITICAL_WINDOW_DAYS} dias)
                  </button>
                )}
                {casesWithoutUpcomingItem.length > 0 && (
                  <span
                    className="px-2 py-1 rounded-full bg-warning/10 text-warning"
                    title={casesWithoutUpcomingItem.map((c) => c.title).join(", ")}
                  >
                    {casesWithoutUpcomingItem.length} processo{casesWithoutUpcomingItem.length === 1 ? "" : "s"} sem nenhum item futuro na agenda
                  </span>
                )}
              </div>
              {casesWithoutUpcomingItem.length > 0 && (
                <p className="text-xs text-muted-foreground truncate">
                  Ex.: {casesWithoutUpcomingItem.slice(0, 3).map((c) => c.title).join(" · ")}
                  {casesWithoutUpcomingItem.length > 3 ? ` e mais ${casesWithoutUpcomingItem.length - 3}` : ""}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Chips de filtro — mesmo agrupamento usado na View de Lista e no banner de risco acima. */}
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(agendaFilterLabels) as AgendaFilterKey[]).map((key) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              activeFilter === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-transparent text-muted-foreground border-border hover:bg-muted"
            }`}
          >
            {agendaFilterLabels[key]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 legal-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-serif text-xl font-semibold">
              {viewMode === "mes" ? `${months[currentDate.getMonth()]} ${currentDate.getFullYear()}` : "Lista de itens da Agenda"}
            </h3>
            <div className="flex items-center gap-2">
              <div className="flex rounded-lg border border-border overflow-hidden">
                <button
                  onClick={() => setViewMode("mes")}
                  className={`p-2 transition-colors ${viewMode === "mes" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  title="Visualização em mês"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode("lista")}
                  className={`p-2 transition-colors ${viewMode === "lista" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                  title="Visualização em lista"
                >
                  <ListIcon className="w-4 h-4" />
                </button>
              </div>
              {viewMode === "mes" && (
                <div className="flex gap-2">
                  <button
                    onClick={prevMonth}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    onClick={nextMonth}
                    className="p-2 hover:bg-muted rounded-lg transition-colors"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {viewMode === "lista" ? (
            <div className="space-y-2 max-h-[520px] overflow-y-auto">
              {upcomingEventsFiltered.length === 0 ? (
                <p className="text-muted-foreground text-sm py-8 text-center">Nenhum item da agenda neste filtro.</p>
              ) : (
                upcomingEventsFiltered.map((event) => {
                  const linkedCase = event.case_id ? casesById.get(event.case_id) : null;
                  const daysToDeadline = differenceInCalendarDays(startOfDay(parseISO(event.event_date)), startOfDay(new Date()));
                  const isCritical = daysToDeadline <= CRITICAL_WINDOW_DAYS && event.computed_status !== "completed" && event.computed_status !== "cancelled";
                  return (
                    <div
                      key={event.id}
                      className={`p-3 rounded-lg border-l-4 flex items-start justify-between gap-3 ${
                        eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.class || eventTypeConfig.meeting.class
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium">
                            {eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label || event.type}
                          </span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isCritical ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"}`}>
                            {describeDueDate(event.event_date)}
                          </span>
                        </div>
                        <p className={`font-medium text-sm mt-1 ${eventTitleClass(event)}`}>{event.title}</p>
                        {linkedCase ? (
                          <button
                            onClick={() => onOpenCase?.(linkedCase.id)}
                            className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                          >
                            <Scale className="w-3 h-3" />
                            {linkedCase.case_number} · {linkedCase.client}
                            <ExternalLink className="w-3 h-3" />
                          </button>
                        ) : (
                          <p className="text-xs text-muted-foreground mt-1">Sem processo vinculado</p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                        {format(parseISO(event.event_date), "dd/MM", { locale: ptBR })}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
          <>
          <div className="grid grid-cols-7 gap-1 mb-2">
            {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((day) => (
              <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {days.map((day, index) => {
              const dayEvents = day ? getEventsForDay(day) : [];
              const dayChecklists = day ? getChecklistsForDay(day) : [];
              const isCurrentDay = day && isToday(day);
              const hasItems = dayEvents.length > 0 || dayChecklists.length > 0;
              
              return (
                <div
                  key={index}
                  onClick={() => day && setSelectedDay(day)}
                  className={`aspect-square p-2 rounded-lg text-center relative ${
                    day ? "hover:bg-muted cursor-pointer transition-colors" : ""
                  } ${
                    isCurrentDay
                      ? "bg-primary text-primary-foreground"
                      : hasItems
                        ? "bg-muted/50 ring-1 ring-inset ring-border"
                        : ""
                  }`}
                >
                  {day && (
                    <>
                      <span className="text-sm">{format(day, "d")}</span>
                      {hasItems && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {dayEvents.slice(0, 3).map((event, i) => (
                            <div
                              key={`event-${i}`}
                              className={`w-2 h-2 rounded-full ${eventDotColor[event.type] || "bg-warning"}`}
                              title={eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label || event.type}
                            />
                          ))}
                          {dayChecklists.slice(0, 2).map((_, i) => (
                            <div
                              key={`checklist-${i}`}
                              className="w-2 h-2 rounded-full bg-muted-foreground"
                              title="Checklist com prazo"
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          </>
          )}
        </div>

        {/* Upcoming Events */}
        <div className="legal-card">
          <h3 className="font-serif text-xl font-semibold mb-4">Próximos Eventos</h3>
          
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-4 rounded-lg border-l-4 border-muted bg-muted/30 animate-pulse">
                  <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : upcomingEvents.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhum evento agendado</p>
              <button
                onClick={() => setIsDialogOpen(true)}
                className="mt-4 text-gold-warm hover:text-gold-dark transition-colors"
              >
                Agendar primeiro evento
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {upcomingEvents.map((event, index) => (
                <div
                  key={event.id}
                  className={`p-4 rounded-lg border-l-4 ${eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.class || eventTypeConfig.meeting.class} fade-in group relative`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => openGoogleCalendar(event)}
                      className="p-1 hover:bg-muted rounded"
                      title="Adicionar ao Google Calendar"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19.5 3h-15A1.5 1.5 0 003 4.5v15A1.5 1.5 0 004.5 21h15a1.5 1.5 0 001.5-1.5v-15A1.5 1.5 0 0019.5 3zM12 18a6 6 0 110-12 6 6 0 010 12zm0-10.5a4.5 4.5 0 100 9 4.5 4.5 0 000-9z"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => downloadICS(event)}
                      className="p-1 hover:bg-muted rounded"
                      title="Baixar para Apple Calendar / Outlook"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14l-4-4 1.41-1.41L11 13.17l4.59-4.58L17 10l-6 6z"/>
                      </svg>
                    </button>
                    {event.participants && event.participants.length > 0 && (
                      <button
                        onClick={() => handleSendInvites(event)}
                        className="p-1 hover:bg-muted rounded"
                        title="Enviar convites"
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    )}
                    {event.meeting_link && (
                      <button
                        onClick={() => copyMeetingLink(event.meeting_link!)}
                        className="p-1 hover:bg-muted rounded"
                        title="Copiar link"
                      >
                        <Link2 className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={() => openEditDialog(event)}
                      className="p-1 hover:bg-muted rounded"
                      title="Editar evento"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    {isApiCreatedEvent(event) ? (
                      <span
                        className="p-1 text-muted-foreground"
                        title="Evento criado automaticamente pela integração — não pode ser excluído manualmente"
                      >
                        <Lock className="w-3 h-3" />
                      </span>
                    ) : (
                      <button
                        onClick={() => deleteEvent.mutate(event)}
                        className="p-1 hover:bg-muted rounded"
                        title="Excluir"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium">
                      {eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label || event.type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(parseISO(event.event_date), "dd MMM", { locale: ptBR })}
                    </span>
                  </div>
                  <p className={`font-medium text-sm mb-2 flex items-center gap-1.5 ${eventTitleClass(event)}`}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleCompleted(event);
                      }}
                      className="shrink-0"
                      title={event.status === "completed" ? "Marcar como pendente" : "Marcar como concluído"}
                    >
                      {event.status === "completed" ? (
                        <CheckCircle2 className="w-4 h-4 text-success" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <span>{event.title}</span>
                  </p>
                  {event.case_id && casesById.get(event.case_id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCase?.(event.case_id as string);
                      }}
                      className="flex items-center gap-1 text-xs text-primary hover:underline mb-2 -mt-1"
                    >
                      <Scale className="w-3 h-3" />
                      {casesById.get(event.case_id)!.case_number} · {casesById.get(event.case_id)!.client}
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                  {event.status && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        updateEvent.mutate({
                          id: event.id,
                          status: event.status === "completed" ? "pending" : "completed",
                        });
                      }}
                      className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full mb-2 transition-colors ${
                        taskStatusConfig[event.computed_status || event.status]?.class || "bg-muted text-muted-foreground"
                      }`}
                      title="Clique para marcar como concluído/pendente"
                    >
                      <CheckSquare className="w-3 h-3" />
                      {taskStatusConfig[event.computed_status || event.status]?.label || event.computed_status || event.status}
                    </button>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {event.event_time}
                    </span>
                    {event.location && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {event.location}
                      </span>
                    )}
                    {event.participants && event.participants.length > 0 && (
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {event.participants.length}
                      </span>
                    )}
                    {event.notification_enabled && (
                      <span className="flex items-center gap-1">
                        <Bell className="w-3 h-3" />
                      </span>
                    )}
                    {event.attachments && event.attachments.length > 0 && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {event.attachments.length}
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <SyncToClickUpButton 
                      title={event.title} 
                      description={event.description || undefined}
                      dueDate={event.event_date}
                      type="event"
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upcoming Checklists */}
          {upcomingChecklists.length > 0 && (
            <div className="mt-6 pt-6 border-t">
              <h4 className="font-serif text-lg font-semibold mb-4 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-warning" />
                Prazos de Checklists
              </h4>
              <div className="space-y-3">
                {upcomingChecklists.map((checklist, index) => (
                  <div
                    key={checklist.id}
                    className="p-3 rounded-lg border-l-4 border-l-warning bg-warning/5 fade-in"
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <span className="text-xs font-medium text-warning uppercase">
                        {checklist.priority === "urgent" ? "Urgente" : 
                         checklist.priority === "high" ? "Alta" : 
                         checklist.priority === "medium" ? "Média" : "Baixa"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {format(parseISO(checklist.due_date!), "dd MMM", { locale: ptBR })}
                      </span>
                    </div>
                    <p className="font-medium text-sm">{checklist.title}</p>
                    {checklist.client_name && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {checklist.client_name}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Histórico de Eventos */}
      <div className="legal-card">
        <h3 className="font-serif text-xl font-semibold mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-muted-foreground" />
          Histórico de Eventos
        </h3>

        {pastEvents.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhum evento passado registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {pastEvents.map((event) => (
              <button
                key={event.id}
                onClick={() => setSelectedDay(parseISO(event.event_date))}
                className={`w-full flex items-center justify-between gap-3 p-3 rounded-lg border-l-4 text-left hover:bg-muted/50 transition-colors ${
                  eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.class || eventTypeConfig.meeting.class
                }`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  {event.status === "completed" ? (
                    <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className={`font-medium text-sm truncate ${eventTitleClass(event)}`}>{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label || event.type} · {event.event_time}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {event.computed_status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${taskStatusConfig[event.computed_status]?.class || "bg-muted text-muted-foreground"}`}>
                      {taskStatusConfig[event.computed_status]?.label || event.computed_status}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {format(parseISO(event.event_date), "dd MMM yyyy", { locale: ptBR })}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* New Event Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">Novo Evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 mt-4">
            {/* Basic Info */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Título *</label>
                <Input
                  type="text"
                  value={newEvent.title}
                  onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                  placeholder="Audiência de Conciliação"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Descrição</label>
                <textarea
                  value={newEvent.description}
                  onChange={(e) => setNewEvent({ ...newEvent, description: e.target.value })}
                  placeholder="Detalhes do evento..."
                  className="legal-input min-h-[80px] resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Data *</label>
                  <Input
                    type="date"
                    min={todayDateStr}
                    value={newEvent.event_date}
                    onChange={(e) => setNewEvent({ ...newEvent, event_date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Horário *</label>
                  <Input
                    type="time"
                    value={newEvent.event_time}
                    onChange={(e) => setNewEvent({ ...newEvent, event_time: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Tipo</label>
                  <select
                    value={newEvent.type}
                    onChange={(e) => setNewEvent({ ...newEvent, type: e.target.value })}
                    className="legal-input"
                  >
                    <option value="meeting">Reunião</option>
                    <option value="hearing">Audiência</option>
                    <option value="deadline">Prazo</option>
                    <option value="tarefa">Tarefa</option>
                    <option value="procedimento">Procedimento</option>
                    <option value="evento_processual">Evento Processual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Local</label>
                  <Input
                    type="text"
                    value={newEvent.location}
                    onChange={(e) => setNewEvent({ ...newEvent, location: e.target.value })}
                    placeholder="Fórum, escritório..."
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 flex items-center gap-2">
                  <Scale className="w-4 h-4" />
                  Processo vinculado
                </label>
                <select
                  value={newEvent.case_id || ""}
                  onChange={(e) => setNewEvent({ ...newEvent, case_id: e.target.value || undefined })}
                  className="legal-input"
                >
                  <option value="">Nenhum</option>
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>{c.case_number} · {c.client}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground mt-1">
                  Todo item da Agenda deveria pertencer a um processo — sem isso ele não entra no cálculo de risco.
                </p>
              </div>
            </div>

            {/* Meeting Link */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Link2 className="w-4 h-4" />
                  Link da Reunião
                </label>
                <button
                  type="button"
                  onClick={generateMeetingLink}
                  className="text-xs text-primary hover:underline"
                >
                  Gerar link automático
                </button>
              </div>
              <Input
                type="url"
                value={newEvent.meeting_link}
                onChange={(e) => setNewEvent({ ...newEvent, meeting_link: e.target.value })}
                placeholder="https://meet.example.com/..."
              />
            </div>

            {/* Participants */}
            <div className="border-t pt-4">
              <label className="text-sm font-medium flex items-center gap-2 mb-3">
                <Users className="w-4 h-4" />
                Participantes
              </label>
              
              <div className="flex gap-2 mb-3">
                <Input
                  type="text"
                  value={newParticipant.name}
                  onChange={(e) => setNewParticipant({ ...newParticipant, name: e.target.value })}
                  placeholder="Nome"
                  className="flex-1"
                />
                <Input
                  type="email"
                  value={newParticipant.email}
                  onChange={(e) => setNewParticipant({ ...newParticipant, email: e.target.value })}
                  placeholder="Email"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddParticipant}
                  className="px-3 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {newEvent.participants && newEvent.participants.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {newEvent.participants.map((p, index) => (
                    <Badge key={index} variant="secondary" className="flex items-center gap-1">
                      {p.name} ({p.email})
                      <button
                        type="button"
                        onClick={() => handleRemoveParticipant(index)}
                        className="ml-1 hover:text-destructive"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* File Upload */}
            <div className="border-t pt-4">
              <label className="text-sm font-medium flex items-center gap-2 mb-3">
                <Upload className="w-4 h-4" />
                Anexos
              </label>
              
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileChange}
                className="hidden"
              />
              
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full border-2 border-dashed border-muted-foreground/25 rounded-lg p-4 text-center hover:border-primary/50 transition-colors"
              >
                <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Clique para selecionar arquivos
                </p>
              </button>

              {newEvent.files && newEvent.files.length > 0 && (
                <div className="mt-3 space-y-2">
                  {newEvent.files.map((file, index) => (
                    <div key={index} className="flex items-center justify-between p-2 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-muted-foreground" />
                        <span className="text-sm truncate max-w-[200px]">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          ({(file.size / 1024).toFixed(1)} KB)
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveFile(index)}
                        className="p-1 hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Notification */}
            <div className="border-t pt-4">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Bell className="w-4 h-4" />
                  Notificação
                </label>
                <Switch
                  checked={newEvent.notification_enabled}
                  onCheckedChange={(checked) => 
                    setNewEvent({ ...newEvent, notification_enabled: checked })
                  }
                />
              </div>
              
              {newEvent.notification_enabled && (
                <div className="mt-3">
                  <Label className="text-sm text-muted-foreground">Lembrar antes</Label>
                  <select
                    value={newEvent.notification_minutes_before}
                    onChange={(e) => 
                      setNewEvent({ ...newEvent, notification_minutes_before: parseInt(e.target.value) })
                    }
                    className="legal-input mt-1"
                  >
                    <option value={15}>15 minutos</option>
                    <option value={30}>30 minutos</option>
                    <option value={60}>1 hora</option>
                    <option value={120}>2 horas</option>
                    <option value={1440}>1 dia</option>
                  </select>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleCreateEvent}
              disabled={!newEvent.title || isRetroactiveEventDateChange(newEvent.event_date) || createEvent.isPending}
              className="legal-button-gold w-full disabled:opacity-50"
            >
              {createEvent.isPending ? "Criando..." : "Criar Evento"}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Day Details Dialog */}
      <Dialog open={!!selectedDay} onOpenChange={(open) => !open && setSelectedDay(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDay && format(selectedDay, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
            </DialogTitle>
          </DialogHeader>
          
          {selectedDay && (
            <div className="space-y-4">
              {/* Filter Tabs */}
              <div className="flex gap-2 border-b">
                <button
                  onClick={() => setDayDetailsFilter("all")}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    dayDetailsFilter === "all"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Todos ({getEventsForDay(selectedDay).length + getChecklistsForDay(selectedDay).length})
                </button>
                <button
                  onClick={() => setDayDetailsFilter("events")}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    dayDetailsFilter === "events"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Eventos ({getEventsForDay(selectedDay).length})
                </button>
                <button
                  onClick={() => setDayDetailsFilter("checklists")}
                  className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 ${
                    dayDetailsFilter === "checklists"
                      ? "border-primary text-primary"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Checklists ({getChecklistsForDay(selectedDay).length})
                </button>
              </div>

              <div className="space-y-6 max-h-[60vh] overflow-y-auto">
                {/* Events Section */}
                {(dayDetailsFilter === "all" || dayDetailsFilter === "events") && (
                  <div>
                    <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-primary" />
                      Eventos
                    </h4>
                    {getEventsForDay(selectedDay).length === 0 ? (
                      <p className="text-muted-foreground text-sm">Nenhum evento neste dia</p>
                    ) : (
                      <div className="space-y-3">
                        {getEventsForDay(selectedDay).map((event) => (
                          <div
                            key={event.id}
                            className={`p-4 rounded-lg border-l-4 ${
                              eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.class || 
                              eventTypeConfig.meeting.class
                            }`}
                          >
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-start gap-2">
                                <button
                                  onClick={() => handleToggleCompleted(event)}
                                  className="shrink-0 mt-0.5"
                                  title={event.status === "completed" ? "Marcar como pendente" : "Marcar como concluído"}
                                >
                                  {event.status === "completed" ? (
                                    <CheckCircle2 className="w-4 h-4 text-success" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-muted-foreground" />
                                  )}
                                </button>
                                <div>
                                  <p className={`font-medium text-base ${eventTitleClass(event)}`}>{event.title}</p>
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label || event.type}
                                  </p>
                                  {event.case_id && casesById.get(event.case_id) && (
                                    <button
                                      onClick={() => onOpenCase?.(event.case_id as string)}
                                      className="flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                                    >
                                      <Scale className="w-3 h-3" />
                                      {casesById.get(event.case_id)!.case_number} · {casesById.get(event.case_id)!.client}
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => openEditDialog(event)}
                                  className="p-1 hover:bg-muted rounded transition-colors"
                                  title="Editar evento"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                {isApiCreatedEvent(event) ? (
                                  <span
                                    className="p-1 text-muted-foreground"
                                    title="Evento criado automaticamente pela integração — não pode ser excluído manualmente"
                                  >
                                    <Lock className="w-4 h-4" />
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => deleteEvent.mutate(event)}
                                    className="p-1 hover:bg-muted rounded transition-colors"
                                    title="Excluir evento"
                                  >
                                    <Trash2 className="w-4 h-4 text-destructive" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {event.status && (
                              <div className="flex items-center gap-2 mb-3">
                                <select
                                  value={event.status}
                                  onChange={(e) =>
                                    updateEvent.mutate({ id: event.id, status: e.target.value as CalendarEvent["status"] & string })
                                  }
                                  className={`text-xs px-2 py-1 rounded-full border-0 cursor-pointer ${
                                    taskStatusConfig[event.status]?.class || "bg-muted text-muted-foreground"
                                  }`}
                                >
                                  {Object.entries(taskStatusConfig).map(([value, { label }]) => (
                                    <option key={value} value={value}>{label}</option>
                                  ))}
                                </select>
                                {event.computed_status === "overdue" && event.status !== "overdue" && (
                                  <span
                                    className={`text-xs px-2 py-1 rounded-full ${taskStatusConfig.overdue.class}`}
                                    title="A data deste evento já passou"
                                  >
                                    {taskStatusConfig.overdue.label}
                                  </span>
                                )}
                                {event.priority && (
                                  <span className="text-xs text-muted-foreground">
                                    Prioridade: {event.priority === "urgent" ? "Urgente" : event.priority === "high" ? "Alta" : event.priority === "medium" ? "Média" : "Baixa"}
                                  </span>
                                )}
                              </div>
                            )}

                            {event.description && (
                              <p className="text-sm text-muted-foreground mb-3">{event.description}</p>
                            )}

                            <div className="space-y-2 text-sm text-muted-foreground">
                              <div className="flex items-center gap-2">
                                <Clock className="w-4 h-4" />
                                <span>{event.event_time}</span>
                              </div>
                              
                              {event.location && (
                                <div className="flex items-center gap-2">
                                  <MapPin className="w-4 h-4" />
                                  <span>{event.location}</span>
                                </div>
                              )}

                              {event.meeting_link && (
                                <div className="flex items-center gap-2">
                                  <Link2 className="w-4 h-4" />
                                  <button
                                    onClick={() => copyMeetingLink(event.meeting_link!)}
                                    className="text-primary hover:underline"
                                  >
                                    Copiar link
                                  </button>
                                </div>
                              )}
                            </div>

                            {event.participants && event.participants.length > 0 && (
                              <div className="mt-3 pt-3 border-t">
                                <div className="flex items-center gap-1 text-sm mb-2">
                                  <Users className="w-4 h-4" />
                                  <span className="font-medium">{event.participants.length} participante(s)</span>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {event.participants.map((p, i) => (
                                    <Badge key={i} variant="secondary" className="text-xs">
                                      {p.name}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Checklists Section */}
                {(dayDetailsFilter === "all" || dayDetailsFilter === "checklists") && (
                  <div className={dayDetailsFilter === "all" ? "border-t pt-4" : ""}>
                    <h4 className="font-semibold text-lg mb-3 flex items-center gap-2">
                      <CheckSquare className="w-5 h-5 text-warning" />
                      Checklists com Prazo
                    </h4>
                    {getChecklistsForDay(selectedDay).length === 0 ? (
                      <p className="text-muted-foreground text-sm">Nenhum checklist com prazo neste dia</p>
                    ) : (
                      <div className="space-y-3">
                        {getChecklistsForDay(selectedDay).map((checklist) => (
                          <div key={checklist.id} className="p-4 rounded-lg border border-warning/30 bg-warning/5">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-medium text-base">{checklist.title}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Status: <span className="capitalize">{checklist.status}</span>
                                </p>
                              </div>
                              <Badge 
                                variant="outline"
                                className={`text-xs ${
                                  checklist.priority === "urgent" ? "border-destructive text-destructive" :
                                  checklist.priority === "high" ? "border-orange-500 text-orange-600" :
                                  checklist.priority === "medium" ? "border-yellow-500 text-yellow-600" :
                                  "border-green-500 text-green-600"
                                }`}
                              >
                                {checklist.priority}
                              </Badge>
                            </div>

                            {checklist.description && (
                              <p className="text-sm text-muted-foreground mb-3">{checklist.description}</p>
                            )}

                            {checklist.client_name && (
                              <p className="text-sm text-muted-foreground mb-2">
                                Cliente: <span className="font-medium">{checklist.client_name}</span>
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Event Dialog */}
      <Dialog open={!!editingEvent} onOpenChange={(open) => !open && setEditingEvent(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">Editar Evento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Título *</Label>
              <Input
                id="edit-title"
                value={editForm.title || ""}
                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                placeholder="Título do evento"
              />
            </div>

            <div>
              <Label htmlFor="edit-description">Descrição</Label>
              <Textarea
                id="edit-description"
                value={editForm.description || ""}
                onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                placeholder="Descrição do evento"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-date">Data *</Label>
                <Input
                  id="edit-date"
                  type="date"
                  min={todayDateStr}
                  value={editForm.event_date || ""}
                  onChange={(e) => setEditForm({ ...editForm, event_date: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="edit-time">Horário *</Label>
                <Input
                  id="edit-time"
                  type="time"
                  value={editForm.event_time || ""}
                  onChange={(e) => setEditForm({ ...editForm, event_time: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-type">Tipo</Label>
                <Select
                  value={editForm.type}
                  onValueChange={(value) => setEditForm({ ...editForm, type: value })}
                >
                  <SelectTrigger id="edit-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(eventTypeConfig).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editForm.status || undefined}
                  onValueChange={(value) => setEditForm({ ...editForm, status: value as EventTaskStatus })}
                >
                  <SelectTrigger id="edit-status">
                    <SelectValue placeholder="Sem status" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(taskStatusConfig).map(([value, { label }]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label htmlFor="edit-location">Local</Label>
              <Input
                id="edit-location"
                value={editForm.location || ""}
                onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                placeholder="Local do evento"
              />
            </div>

            {!(editingEvent && isApiCreatedEvent(editingEvent)) && (
              <div>
                <Label htmlFor="edit-case" className="flex items-center gap-1.5">
                  <Scale className="w-3.5 h-3.5" />
                  Processo vinculado
                </Label>
                <Select
                  value={editForm.case_id || "none"}
                  onValueChange={(value) => setEditForm({ ...editForm, case_id: value === "none" ? null : value })}
                >
                  <SelectTrigger id="edit-case">
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.case_number} · {c.client}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label htmlFor="edit-meeting-link">Link da reunião</Label>
              <Input
                id="edit-meeting-link"
                value={editForm.meeting_link || ""}
                onChange={(e) => setEditForm({ ...editForm, meeting_link: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="edit-notification">Notificação</Label>
              <Switch
                id="edit-notification"
                checked={!!editForm.notification_enabled}
                onCheckedChange={(checked) => setEditForm({ ...editForm, notification_enabled: checked })}
              />
            </div>

            {editingEvent && isApiCreatedEvent(editingEvent) && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Lock className="w-3 h-3" />
                Este evento foi criado automaticamente pela integração e não pode ser excluído manualmente.
              </p>
            )}

            <div className="flex justify-between items-center pt-2">
              {editingEvent && !isApiCreatedEvent(editingEvent) ? (
                <button
                  onClick={() => {
                    deleteEvent.mutate(editingEvent);
                    setEditingEvent(null);
                  }}
                  className="text-destructive hover:underline text-sm flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  Excluir evento
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingEvent(null)}
                  className="legal-button-secondary"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleUpdateEvent}
                  disabled={
                    !editForm.title ||
                    updateEvent.isPending ||
                    isRetroactiveEventDateChange(editForm.event_date || "", editingEvent?.event_date)
                  }
                  className="legal-button-primary disabled:opacity-50"
                >
                  Salvar
                </button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>

  );
}
