import { apiClient } from "@/lib/api-client";
import {
  RightsRequest,
  ListResponse,
  CreateRightsRequestInput,
  UpdateRightsRequestInput,
  RightsRequestListFilter,
} from "@/types/api";

export const rightsAPI = {
  list: (filters?: RightsRequestListFilter) =>
    apiClient.get<ListResponse<RightsRequest>>("/rights-requests", { params: filters }),

  get: (id: string) =>
    apiClient.get<RightsRequest>(`/rights-requests/${id}`),

  create: (data: CreateRightsRequestInput) =>
    apiClient.post<RightsRequest>("/rights-requests", data),

  update: (id: string, data: UpdateRightsRequestInput) =>
    apiClient.patch<RightsRequest>(`/rights-requests/${id}`, data),

  assign: (id: string, data: { assigned_to: string }) =>
    apiClient.post(`/rights-requests/${id}/assign`, data),

  complete: (id: string, data: UpdateRightsRequestInput) =>
    apiClient.post(`/rights-requests/${id}/complete`, data),

  reject: (id: string, data: { rejection_reason: string }) =>
    apiClient.post(`/rights-requests/${id}/reject`, data),

  overdue: () =>
    apiClient.get<ListResponse<RightsRequest>>("/rights-requests/overdue"),

  search: (id: string, data: { data_principal_email: string }) =>
    apiClient.post(`/rights-requests/${id}/search`, data),
};

