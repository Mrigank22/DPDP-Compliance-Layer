import { apiClient } from "@/lib/api-client";
import {
  Finding,
  FindingListFilter,
  FindingsSummary,
  ResolveFindingInput,
  TrendPoint,
} from "@/types/api";

export const findingsAPI = {
  list: (filters?: FindingListFilter) =>
    apiClient.get<Finding[]>("/findings", { params: filters }),

  get: (id: string) => apiClient.get<Finding>(`/findings/${id}`),

  resolve: (id: string, data: ResolveFindingInput) =>
    apiClient.post<Finding>(`/findings/${id}/resolve`, data),

  markFalsePositive: (id: string, data?: ResolveFindingInput) =>
    apiClient.post<Finding>(`/findings/${id}/false-positive`, data ?? {}),

  summary: () => apiClient.get<FindingsSummary>("/findings/summary"),

  trends: (days = 30) =>
    apiClient.get<TrendPoint[]>("/findings/trends", { params: { days } }),
};

