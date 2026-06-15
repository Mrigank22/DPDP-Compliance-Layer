import { apiClient } from "@/lib/api-client";
import {
  Finding,
  ListResponse,
  FindingListFilter,
  FindingsSummary,
} from "@/types/api";

export const findingsAPI = {
  list: (filters?: FindingListFilter) =>
    apiClient.get<ListResponse<Finding>>("/findings", { params: filters }),

  get: (id: string) =>
    apiClient.get<Finding>(`/findings/${id}`),

  resolve: (id: string, data: { resolution_note: string }) =>
    apiClient.post(`/findings/${id}/resolve`, data),

  markFalsePositive: (id: string, data: { resolution_note: string }) =>
    apiClient.post(`/findings/${id}/false-positive`, data),

  summary: () =>
    apiClient.get<FindingsSummary>("/findings/summary"),

  trends: (days = 30) =>
    apiClient.get("/findings/trends", { params: { days } }),
};

