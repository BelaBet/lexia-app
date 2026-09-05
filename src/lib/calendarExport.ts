import { CalendarEvent } from "@/hooks/useEvents";
import { format } from "date-fns";

/**
 * Generate Google Calendar URL for an event
 */
export function generateGoogleCalendarUrl(event: CalendarEvent): string {
  const startDate = new Date(`${event.event_date}T${event.event_time}`);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour duration

  const formatGoogleDate = (date: Date) => {
    return date.toISOString().replace(/-|:|\.\d{3}/g, "");
  };

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${formatGoogleDate(startDate)}/${formatGoogleDate(endDate)}`,
  });

  if (event.description) {
    params.append("details", event.description);
  }

  if (event.location) {
    params.append("location", event.location);
  }

  if (event.meeting_link) {
    const currentDetails = params.get("details") || "";
    params.set("details", `${currentDetails}\n\nLink da reunião: ${event.meeting_link}`);
  }

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/**
 * Generate ICS file content for an event (works with Apple Calendar, Outlook, etc.)
 */
export function generateICSContent(event: CalendarEvent): string {
  const startDate = new Date(`${event.event_date}T${event.event_time}`);
  const endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // Default 1 hour duration

  const formatICSDate = (date: Date) => {
    // Mantém o "Z" final: toISOString() já está em UTC, e sem o "Z" o
    // horário vira "floating time" (sem timezone), que muitos calendários
    // (Outlook, Apple Calendar) interpretam no fuso do dispositivo do
    // destinatário em vez do horário real do evento — deslocando a hora
    // exibida (ex.: 14:30 no Brasil apareceria como 17:30).
    return date.toISOString().replace(/-|:|\.\d{3}/g, "");
  };

  const escapeICS = (text: string) => {
    return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  };

  let description = event.description || "";
  if (event.meeting_link) {
    description += `\n\nLink da reunião: ${event.meeting_link}`;
  }

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LexIA//Calendar//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${event.id}@lexia.app`,
    `DTSTAMP:${formatICSDate(new Date())}`,
    `DTSTART:${formatICSDate(startDate)}`,
    `DTEND:${formatICSDate(endDate)}`,
    `SUMMARY:${escapeICS(event.title)}`,
  ];

  if (description) {
    lines.push(`DESCRIPTION:${escapeICS(description)}`);
  }

  if (event.location) {
    lines.push(`LOCATION:${escapeICS(event.location)}`);
  }

  // Add participants
  if (event.participants && event.participants.length > 0) {
    event.participants.forEach((p) => {
      lines.push(`ATTENDEE;CN=${escapeICS(p.name)}:mailto:${p.email}`);
    });
  }

  // Add reminder/alarm
  if (event.notification_enabled && event.notification_minutes_before != null) {
    lines.push("BEGIN:VALARM");
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:Lembrete: ${escapeICS(event.title)}`);
    lines.push(`TRIGGER:-PT${event.notification_minutes_before}M`);
    lines.push("END:VALARM");
  }

  lines.push("END:VEVENT");
  lines.push("END:VCALENDAR");

  return lines.join("\r\n");
}

/**
 * Download ICS file for an event
 */
export function downloadICS(event: CalendarEvent): void {
  const content = generateICSContent(event);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.download = `${event.title.replace(/[^a-z0-9]/gi, "_")}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Open Google Calendar with event
 */
export function openGoogleCalendar(event: CalendarEvent): void {
  const url = generateGoogleCalendarUrl(event);
  window.open(url, "_blank");
}
