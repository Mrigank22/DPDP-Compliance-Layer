import { apiClient } from "@/lib/api-client";
import {
  GatewayRule,
  ListResponse,
  GatewayEvent,
  GatewayStats,
  CreateGatewayRuleInput,
  UpdateGatewayRuleInput,
  PaginationParams,
} from "@/types/api";

export const gatewayAPI = {
  // Rules
  listRules: (filters?: PaginationParams) =>
    apiClient.get<ListResponse<GatewayRule>>("/gateway/rules", { params: filters }),

  getRule: (id: string) =>
    apiClient.get<GatewayRule>(`/gateway/rules/${id}`),

  createRule: (data: CreateGatewayRuleInput) =>
    apiClient.post<GatewayRule>("/gateway/rules", data),

  updateRule: (id: string, data: UpdateGatewayRuleInput) =>
    apiClient.patch<GatewayRule>(`/gateway/rules/${id}`, data),

  deleteRule: (id: string) =>
    apiClient.delete(`/gateway/rules/${id}`),

  toggleRule: (id: string) =>
    apiClient.post(`/gateway/rules/${id}/toggle`),

  // Stats
  getStats: () =>
    apiClient.get<GatewayStats>("/gateway/stats"),

  // Data flows
  listDataFlows: (filters?: PaginationParams) =>
    apiClient.get("/gateway/data-flows", { params: filters }),

  approveDataFlow: (id: string) =>
    apiClient.post(`/gateway/data-flows/${id}/approve`),
};

