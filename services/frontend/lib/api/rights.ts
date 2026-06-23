import { apiClient } from "@/lib/api-client";
import {
  RightsRequest,
  CreateRightsRequestInput,
  UpdateRightsRequestInput,
  RightsRequestListFilter,
} from "@/types/api";

export const rightsAPI = {
  list: (filters?: RightsRequestListFilter) =>
    apiClient.get<RightsRequest[]>("/rights-requests", { params: filters }),

  get: (id: string) => apiClient.get<RightsRequest>(`/rights-requests/${id}`),

  create: (data: CreateRightsRequestInput) =>
    apiClient.post<RightsRequest>("/rights-requests", data),

  update: (id: string, data: UpdateRightsRequestInput) =>
    apiClient.patch<RightsRequest>(`/rights-requests/${id}`, data),

  assign: (id: string, assigneeId: string) =>
    apiClient.post<RightsRequest>(`/rights-requests/${id}/assign`, { assignee_id: assigneeId }),

  complete: (id: string, responseData: Record<string, unknown>) =>
    apiClient.post<RightsRequest>(`/rights-requests/${id}/complete`, { response_data: responseData }),

  reject: (id: string, reason: string) =>
    apiClient.post<RightsRequest>(`/rights-requests/${id}/reject`, { reason }),

  verify: (id: string, method?: string) =>
    apiClient.post<RightsRequest>(`/rights-requests/${id}/verify`, { method }),

  approve: (id: string) =>
    apiClient.post<RightsRequest>(`/rights-requests/${id}/approve`),

  overdue: () =>
    apiClient.get<{ requests: RightsRequest[]; count: number }>("/rights-requests/overdue"),

  search: (id: string) =>
    apiClient.post<{ task_id: string; message: string }>(`/rights-requests/${id}/search`),
};

