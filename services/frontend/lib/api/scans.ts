import { apiClient } from "@/lib/api-client";
import { Scan, ScanListFilter } from "@/types/api";

export const scansAPI = {
  list: (filters?: ScanListFilter) =>
    apiClient.get<Scan[]>("/scans", { params: filters }),

  get: (id: string) => apiClient.get<Scan>(`/scans/${id}`),

  cancel: (id: string) => apiClient.post<Scan>(`/scans/${id}/cancel`),
};

