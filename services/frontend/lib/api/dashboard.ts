import { apiClient } from "@/lib/api-client";
import { DashboardSummary, DPDPStatus, TrendPoint } from "@/types/api";

export const dashboardAPI = {
  getSummary: () => apiClient.get<DashboardSummary>("/dashboard"),

  getDPDPStatus: () => apiClient.get<DPDPStatus>("/dashboard/dpdp-status"),

  getTrends: (days = 30) =>
    apiClient.get<TrendPoint[]>("/dashboard/trends", { params: { days } }),
};

