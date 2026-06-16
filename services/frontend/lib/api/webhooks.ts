import { apiClient } from "@/lib/api-client";
import {
  Webhook,
  CreateWebhookInput,
  UpdateWebhookInput,
  WebhookCreateResult,
  NotificationPrefs,
} from "@/types/api";

export const webhooksAPI = {
  list: () => apiClient.get<Webhook[]>("/webhooks"),

  create: (data: CreateWebhookInput) =>
    apiClient.post<Webhook | WebhookCreateResult>("/webhooks", data),

  update: (id: string, data: UpdateWebhookInput) =>
    apiClient.patch<Webhook>(`/webhooks/${id}`, data),

  remove: (id: string) => apiClient.delete(`/webhooks/${id}`),

  test: (id: string) =>
    apiClient.post<{ success: boolean; status_code?: number; message?: string; error?: string }>(
      `/webhooks/${id}/test`,
    ),

  getPrefs: () => apiClient.get<NotificationPrefs>("/alerts/config"),

  updatePrefs: (data: NotificationPrefs) =>
    apiClient.patch<NotificationPrefs>("/alerts/config", data),
};
