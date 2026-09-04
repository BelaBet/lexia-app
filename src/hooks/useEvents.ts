import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface EventParticipant {
  id: string;
  event_id: string;
  name: string;
  email: string;
  invite_sent: boolean;
  created_at: string;
}

export interface EventAttachment {
  id: string;
  event_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  file_type: string | null;
  created_at: string;
}

export type EventTaskStatus = "pending" | "in_progress" | "completed" | "overdue" | "cancelled";
export type EventTaskPriority = "low" | "medium" | "high" | "urgent";

export interface CalendarEvent {
  id: string;
  title: string;
  description: string | null;
  event_date: string;
  event_time: string;
  type: string;
  location: string | null;
  meeting_link: string | null;
  notification_enabled: boolean;
  notification_minutes_before: number | null;
  case_id: string | null;
  created_at: string;
  /** Status de tarefa (pendente/em andamento/concluído/atrasado/cancelado). Nulo = evento sem acompanhamento de tarefa. */
  status: EventTaskStatus | null;
  /** Prioridade da tarefa associada ao evento. */
  priority: EventTaskPriority | null;
  /** Publicação que originou este evento automaticamente (prazo externo/interno). */
  publication_id: string | null;
  participants?: EventParticipant[];
  attachments?: EventAttachment[];
}

export interface CreateEventData {
  title: string;
  description?: string;
  event_date: string;
  event_time: string;
  type?: string;
  location?: string;
  meeting_link?: string;
  notification_enabled?: boolean;
  notification_minutes_before?: number;
  case_id?: string;
  participants?: { name: string; email: string }[];
  files?: File[];
}

export function useEvents() {
  return useQuery({
    queryKey: ["events"],
    queryFn: async () => {
      const { data: events, error } = await supabase
        .from("events")
        .select("*")
        .order("event_date", { ascending: true });

      if (error) throw error;
      
      // Fetch participants and attachments for each event
      const eventsWithDetails = await Promise.all(
        (events || []).map(async (event) => {
          const [participantsRes, attachmentsRes] = await Promise.all([
            supabase.from("event_participants").select("*").eq("event_id", event.id),
            supabase.from("event_attachments").select("*").eq("event_id", event.id),
          ]);
          
          return {
            ...event,
            participants: participantsRes.data || [],
            attachments: attachmentsRes.data || [],
          } as CalendarEvent;
        })
      );
      
      return eventsWithDetails;
    },
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (eventData: CreateEventData) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("User not authenticated");

      // Create the event first
      const { data: event, error: eventError } = await supabase
        .from("events")
        .insert({
          title: eventData.title,
          description: eventData.description || null,
          event_date: eventData.event_date,
          event_time: eventData.event_time,
          type: eventData.type || "meeting",
          location: eventData.location || null,
          meeting_link: eventData.meeting_link || null,
          notification_enabled: eventData.notification_enabled || false,
          notification_minutes_before: eventData.notification_minutes_before || 30,
          case_id: eventData.case_id || null,
          user_id: user.id, // Add user_id for RLS
        })
        .select()
        .single();

      if (eventError) throw eventError;

      // Add participants if any
      if (eventData.participants && eventData.participants.length > 0) {
        const participantsToInsert = eventData.participants.map((p) => ({
          event_id: event.id,
          name: p.name,
          email: p.email,
        }));

        const { error: participantsError } = await supabase
          .from("event_participants")
          .insert(participantsToInsert);

        if (participantsError) {
          console.error("Error adding participants:", participantsError);
        }
      }

      // Upload files if any
      if (eventData.files && eventData.files.length > 0) {
        for (const file of eventData.files) {
          const filePath = `${user.id}/${event.id}/${Date.now()}_${file.name}`;
          
          const { error: uploadError } = await supabase.storage
            .from("event-files")
            .upload(filePath, file);

          if (uploadError) {
            console.error("Error uploading file:", uploadError);
            continue;
          }

          const { error: attachmentError } = await supabase
            .from("event_attachments")
            .insert({
              event_id: event.id,
              file_name: file.name,
              file_path: filePath,
              file_size: file.size,
              file_type: file.type,
            });

          if (attachmentError) {
            console.error("Error saving attachment:", attachmentError);
          }
        }
      }

      return event;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Evento criado com sucesso!");
    },
    onError: (error) => {
      console.error("Error creating event:", error);
      toast.error("Erro ao criar evento");
    },
  });
}

export function useUpdateEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status, priority }: { id: string; status?: EventTaskStatus; priority?: EventTaskPriority }) => {
      const updates: Record<string, unknown> = {};
      if (status !== undefined) updates.status = status;
      if (priority !== undefined) updates.priority = priority;

      const { data, error } = await supabase.from("events").update(updates).eq("id", id).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
    },
    onError: (error) => {
      console.error("Error updating event:", error);
      toast.error("Erro ao atualizar tarefa");
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      // Delete attachments from storage first
      const { data: attachments } = await supabase
        .from("event_attachments")
        .select("file_path")
        .eq("event_id", id);

      if (attachments && attachments.length > 0) {
        const filePaths = attachments.map((a) => a.file_path);
        await supabase.storage.from("event-files").remove(filePaths);
      }

      const { error } = await supabase.from("events").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Evento excluído!");
    },
    onError: (error) => {
      console.error("Error deleting event:", error);
      toast.error("Erro ao excluir evento");
    },
  });
}

export function useSendInvites() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ eventId, participants }: { eventId: string; participants: EventParticipant[] }) => {
      // Mark participants as invited
      const participantIds = participants.map((p) => p.id);
      
      const { error } = await supabase
        .from("event_participants")
        .update({ invite_sent: true })
        .in("id", participantIds);

      if (error) throw error;

      return participants;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["events"] });
      toast.success("Convites marcados como enviados!");
    },
    onError: (error) => {
      console.error("Error sending invites:", error);
      toast.error("Erro ao enviar convites");
    },
  });
}
