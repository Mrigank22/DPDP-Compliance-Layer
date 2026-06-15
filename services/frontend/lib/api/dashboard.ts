import { apiClient } from "@/lib/api-client";
import {
  DashboardStats,
  DPDPStatus,
} from "@/types/api";

export const dashboardAPI = {
  getStats: () =>
    apiClient.get<DashboardStats>("/dashboard"),

  getDPDPStatus: () =>
    apiClient.get<DPDPStatus>("/dashboard/dpdp-status"),

  getTrends: (days = 30) =>
    apiClient.get("/dashboard/trends", { params: { days } }),
};

