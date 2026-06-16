import { apiClient } from "@/lib/api-client";
import {
  GatewayRule,
  GatewayStats,
  GatewayEvent,
  DataFlow,
  CreateGatewayRuleInput,
  UpdateGatewayRuleInput,
  PaginationParams,
} from "@/types/api";

export interface GatewayEventFilter extends PaginationParams {
  action?: string;
  pii_type?: string;
  was_llm_call?: boolean;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api/v1";

export const gatewayAPI = {
  listRules: (filters?: PaginationParams) =>
    apiClient.get<GatewayRule[]>("/gateway/rules", { params: filters }),

  getRule: (id: string) => apiClient.get<GatewayRule>(`/gateway/rules/${id}`),

  createRule: (data: CreateGatewayRuleInput) =>
    apiClient.post<GatewayRule>("/gateway/rules", data),

  updateRule: (id: string, data: UpdateGatewayRuleInput) =>
    apiClient.patch<GatewayRule>(`/gateway/rules/${id}`, data),

  deleteRule: (id: string) => apiClient.delete(`/gateway/rules/${id}`),

  toggleRule: (id: string) =>
    apiClient.post<GatewayRule>(`/gateway/rules/${id}/toggle`),

  getStats: (hours = 24) =>
    apiClient.get<GatewayStats>("/gateway/stats", { params: { hours } }),

  listDataFlows: () => apiClient.get<DataFlow[]>("/gateway/data-flows"),

  approveDataFlow: (id: string) =>
    apiClient.post<DataFlow>(`/gateway/data-flows/${id}/approve`),

  listEvents: (filters?: GatewayEventFilter) =>
    apiClient.get<GatewayEvent[]>("/gateway/events", { params: filters }),

  /** Absolute URL for the SSE live-event stream. */
  liveEventsURL: () => `${API_BASE}/gateway/events/live`,
};

