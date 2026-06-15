import { apiClient } from "@/lib/api-client";
import {
  Alert,
  ListResponse,
  AlertListFilter,
} from "@/types/api";

export const alertsAPI = {
  list: (filters?: AlertListFilter) =>
    apiClient.get<ListResponse<Alert>>("/alerts", { params: filters }),

  get: (id: string) =>
    apiClient.get<Alert>(`/alerts/${id}`),

  unread: () =>
    apiClient.get<ListResponse<Alert>>("/alerts/unread"),

  acknowledge: (data: { alert_ids: string[] }) =>
    apiClient.post("/alerts/acknowledge", data),

  acknowledgeAll: () =>
    apiClient.post("/alerts/acknowledge-all"),
};

