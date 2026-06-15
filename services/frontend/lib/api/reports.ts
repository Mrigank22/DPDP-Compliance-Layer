import { apiClient } from "@/lib/api-client";
import {
  Report,
  ListResponse,
  GenerateReportInput,
  PaginationParams,
} from "@/types/api";

export const reportsAPI = {
  list: (filters?: PaginationParams) =>
    apiClient.get<ListResponse<Report>>("/reports", { params: filters }),

  get: (id: string) =>
    apiClient.get<Report>(`/reports/${id}`),

  generate: (data: GenerateReportInput) =>
    apiClient.post<Report>("/reports", data),

  delete: (id: string) =>
    apiClient.delete(`/reports/${id}`),

  getTemplates: () =>
    apiClient.get("/reports/templates"),

  download: (id: string) => {
    return `${process.env.NEXT_PUBLIC_API_URL}/reports/${id}/download`;
  },
};

