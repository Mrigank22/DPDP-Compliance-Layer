import { apiClient } from "@/lib/api-client";
import {
  ConsentSummary,
  ConsentPrincipalResult,
  ConsentRecord,
  RecordConsentInput,
} from "@/types/api";

export const consentAPI = {
  summary: () => apiClient.get<ConsentSummary>("/consent/summary"),

  byPrincipal: (principalId: string) =>
    apiClient.get<ConsentPrincipalResult>(
      `/consent/principal/${encodeURIComponent(principalId)}`,
    ),

  record: (data: RecordConsentInput) =>
    apiClient.post<ConsentRecord>("/consent/record", data),

  withdraw: (recordId: string) =>
    apiClient.post<ConsentRecord>(`/consent/withdraw/${recordId}`),

  withdrawAll: (principalId: string) =>
    apiClient.post<{ data_principal_id: string; withdrawn_count: number; withdrawn_at: string }>(
      `/consent/withdraw-all/${encodeURIComponent(principalId)}`,
    ),
};
