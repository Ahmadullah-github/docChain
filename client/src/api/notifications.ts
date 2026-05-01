import { getJson, patchJson, postJson } from "./http";
import type { EntityId, JsonRecord, NotificationItem } from "./types";

type NotificationQuery = {
  status?: string;
  limit?: number;
};

export const notificationApi = {
  list(query?: NotificationQuery) {
    return getJson<NotificationItem[]>("/api/notifications", query);
  },

  unreadCount() {
    return getJson<{ count: number }>("/api/notifications/unread-count");
  },

  markRead(notificationId: EntityId) {
    return patchJson<NotificationItem>(`/api/notifications/${notificationId}/read`);
  },

  markAllRead() {
    return patchJson<{ markedRead: boolean }>("/api/notifications/read-all");
  },

  listPreferences() {
    return getJson<JsonRecord[]>("/api/notification-preferences");
  },

  savePreference(input: {
    notification_type: string;
    in_app_enabled?: boolean;
    email_enabled?: boolean;
    sms_enabled?: boolean;
    settings?: JsonRecord;
  }) {
    return postJson<JsonRecord>("/api/notification-preferences", input);
  }
};
