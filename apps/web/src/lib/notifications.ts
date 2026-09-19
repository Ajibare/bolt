import { apiRequest } from "./api";
import { authStorage } from "./auth-storage";

function authHeader(): { token: string } {
  const token = authStorage.getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return { token };
}

export type NotificationSeverity = "info" | "warn" | "error";

export interface AppNotification {
  id: string;
  userId: string;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationList {
  notifications: AppNotification[];
  unreadCount: number;
}

export function listNotifications(limit = 50, unreadOnly = false): Promise<NotificationList> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (unreadOnly) {
    params.set("unreadOnly", "true");
  }
  return apiRequest<NotificationList>(`/api/notifications?${params.toString()}`, authHeader());
}

export function unreadNotificationCount(): Promise<number> {
  return apiRequest<number>("/api/notifications/unread-count", authHeader());
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  await apiRequest<{ ok: boolean }>(`/api/notifications/${notificationId}/read`, {
    ...authHeader(),
    method: "POST",
  });
}

export async function markAllNotificationsRead(): Promise<void> {
  await apiRequest<{ updated: number }>("/api/notifications/read-all", {
    ...authHeader(),
    method: "POST",
  });
}
