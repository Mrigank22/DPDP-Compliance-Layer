import { apiClient } from "@/lib/api-client";
import { Alert, AlertListFilter } from "@/types/api";

export const alertsAPI = {
  list: (filters?: AlertListFilter) =>
    apiClient.get<Alert[]>("/alerts", { params: filters }),

  get: (id: string) => apiClient.get<Alert>(`/alerts/${id}`),

  unread: () =>
    apiClient.get<{ alerts: Alert[]; count: number }>("/alerts/unread"),

  acknowledge: (alertIds: string[]) =>
    apiClient.post("/alerts/acknowledge", { alert_ids: alertIds }),

  acknowledgeAll: () => apiClient.post("/alerts/acknowledge-all"),

  delete: (id: string) => apiClient.delete(`/alerts/${id}`),
};

