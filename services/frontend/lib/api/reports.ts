import { apiClient } from "@/lib/api-client";
import { Report, GenerateReportInput, PaginationParams } from "@/types/api";

export interface ReportTemplate {
  report_type: string;
  name: string;
  description: string;
}

export const reportsAPI = {
  list: (filters?: PaginationParams) =>
    apiClient.get<Report[]>("/reports", { params: filters }),

  get: (id: string) => apiClient.get<Report>(`/reports/${id}`),

  generate: (data: GenerateReportInput) =>
    apiClient.post<Report>("/reports", data),

  delete: (id: string) => apiClient.delete(`/reports/${id}`),

  getTemplates: () =>
    apiClient.get<{ templates: ReportTemplate[] }>("/reports/templates"),
};

