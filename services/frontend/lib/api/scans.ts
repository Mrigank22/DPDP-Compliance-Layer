import { apiClient } from "@/lib/api-client";
import {
  Scan,
  ListResponse,
  ScanListFilter,
} from "@/types/api";

export const scansAPI = {
  list: (filters?: ScanListFilter) =>
    apiClient.get<ListResponse<Scan>>("/scans", { params: filters }),

  get: (id: string) =>
    apiClient.get<Scan>(`/scans/${id}`),

  cancel: (id: string) =>
    apiClient.post(`/scans/${id}/cancel`),
};

