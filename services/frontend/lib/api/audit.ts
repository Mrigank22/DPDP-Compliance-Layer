import { apiClient } from "@/lib/api-client";
import { AuditLog, AuditLogFilter } from "@/types/api";

export interface AuditVerifyResult {
  valid: boolean;
  entries: number;
  broken_at_seq?: number;
  message: string;
}

export const auditAPI = {
  list: (filters?: AuditLogFilter) =>
    apiClient.get<AuditLog[]>("/audit-logs", { params: filters }),

  verify: () => apiClient.get<AuditVerifyResult>("/audit-logs/verify"),
};