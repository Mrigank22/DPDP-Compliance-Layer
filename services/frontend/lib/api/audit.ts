import { apiClient } from "@/lib/api-client";
import { AuditLog, AuditLogFilter } from "@/types/api";

export const auditAPI = {
  list: (filters?: AuditLogFilter) =>
    apiClient.get<AuditLog[]>("/audit-logs", { params: filters }),
};