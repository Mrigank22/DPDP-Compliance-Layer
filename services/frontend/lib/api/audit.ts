import { apiClient } from "@/lib/api-client";
import { AuditLog, ListResponse, PaginationParams } from "@/types/api";

export const auditAPI = {
  list: (filters?: PaginationParams & { action?: string; resource?: string; user_id?: string; start_date?: string; end_date?: string }) =>
    apiClient.get<ListResponse<AuditLog>>("/audit-logs", { params: filters }),
};