import type { AppNotification } from "@/hooks/useAppNotifications";

type Target =
  | { kind: "case"; id: string }
  | { kind: "event"; id: string }
  | { kind: "tab"; tab: string }
  | null;

const tabs = new Set([
  "dashboard", "publications", "cases", "process-search", "calendar", "documents",
  "document-creator", "checklists", "assistant", "pdf-reader", "financial-counter",
  "guide", "profile", "branding", "admin", "companies", "settings", "billing", "sales",
]);

export function notificationTarget(notification: Pick<AppNotification, "link_tab" | "link_id">): Target {
  // Old agenda notifications used a tab name that never existed in the UI.
  const tab = notification.link_tab === "agenda" ? "calendar" : notification.link_tab;
  if (!tab || !tabs.has(tab)) return null;
  if (notification.link_id && tab === "cases") return { kind: "case", id: notification.link_id };
  if (notification.link_id && tab === "calendar") return { kind: "event", id: notification.link_id };
  return { kind: "tab", tab };
}
