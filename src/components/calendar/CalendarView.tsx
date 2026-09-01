import { useState, useRef, useEffect } from "react";
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
  FileText
} from "lucide-react";
import { useEvents, useCreateEvent, useDeleteEvent, useSendInvites, CalendarEvent, CreateEventData } from "@/hooks/useEvents";
import { useChecklists } from "@/hooks/useChecklists";
import { useNotifications } from "@/hooks/useNotifications";
import { openGoogleCalendar, downloadICS } from "@/lib/calendarExport";
import { SyncToClickUpButton } from "@/components/integrations/SyncToClickUpButton";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday, startOfDay, parseISO } from "date-fns";
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
import { toast } from "sonner";

const eventTypeConfig = {
  hearing: { label: "Audiência", class: "bg-primary/10 text-primary border-l-primary" },
  deadline: { label: "Prazo", class: "bg-destructive/10 text-destructive border-l-destructive" },
  meeting: { label: "Reunião", class: "bg-success/10 text-success border-l-success" },
};

const months = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

interface Participant {
  name: string;
  email: string;
}

export function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [dayDetailsFilter, setDayDetailsFilter] = useState<"all" | "events" | "checklists">("all");
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
    participants: [],
    files: [],
  });
  const [newParticipant, setNewParticipant] = useState<Participant>({ name: "", email: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: events = [], isLoading } = useEvents();
  const { data: checklists = [] } = useChecklists();
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
    return events.filter((e) => isSameDay(new Date(e.event_date), day));
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

  const days = getDaysInMonth();

  const today = startOfDay(new Date());
  const upcomingEvents = events
    .filter((e) => startOfDay(parseISO(e.event_date)) >= today)
    .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
    .slice(0, 5);

  const upcomingChecklists = checklists
    .filter((c) => c.due_date && c.status !== "completed" && c.status !== "cancelled")
    .filter((c) => startOfDay(parseISO(c.due_date!)) >= today)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 3);

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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="lg:col-span-2 legal-card">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-serif text-xl font-semibold">
              {months[currentDate.getMonth()]} {currentDate.getFullYear()}
            </h3>
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
          </div>

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
                  } ${isCurrentDay ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {day && (
                    <>
                      <span className="text-sm">{format(day, "d")}</span>
                      {hasItems && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {dayEvents.slice(0, 2).map((event, i) => (
                            <div
                              key={`event-${i}`}
                              className="w-1.5 h-1.5 rounded-full bg-warning"
                              title={eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label}
                            />
                          ))}
                          {dayChecklists.slice(0, 2).map((_, i) => (
                            <div
                              key={`checklist-${i}`}
                              className="w-1.5 h-1.5 rounded-full bg-warning"
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
                      onClick={() => deleteEvent.mutate(event.id)}
                      className="p-1 hover:bg-muted rounded"
                      title="Excluir"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex items-start justify-between mb-2">
                    <span className="text-xs font-medium">
                      {eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label || event.type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(event.event_date), "dd MMM", { locale: ptBR })}
                    </span>
                  </div>
                  <p className="font-medium text-sm mb-2">{event.title}</p>
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
              disabled={!newEvent.title || createEvent.isPending}
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
                              <div>
                                <p className="font-medium text-base">{event.title}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {eventTypeConfig[event.type as keyof typeof eventTypeConfig]?.label || event.type}
                                </p>
                              </div>
                              <button
                                onClick={() => deleteEvent.mutate(event.id)}
                                className="p-1 hover:bg-muted rounded transition-colors"
                                title="Excluir evento"
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </button>
                            </div>

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
    </div>

  );
}
