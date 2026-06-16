import { apiClient } from "@/lib/api-client";
import {
  APIKey,
  APIKeyCreateResponse,
  CreateAPIKeyInput,
  UpdateAPIKeyInput,
  PaginationParams,
} from "@/types/api";

export const apiKeysAPI = {
  list: (filters?: PaginationParams) =>
    apiClient.get<APIKey[]>("/apikeys", { params: filters }),

  get: (id: string) => apiClient.get<APIKey>(`/apikeys/${id}`),

  create: (data: CreateAPIKeyInput) =>
    apiClient.post<APIKeyCreateResponse>("/apikeys", data),

  update: (id: string, data: UpdateAPIKeyInput) =>
    apiClient.patch<APIKey>(`/apikeys/${id}`, data),

  revoke: (id: string) => apiClient.delete(`/apikeys/${id}`),

  revokeAll: () =>
    apiClient.delete<{ revoked: number; message: string }>("/apikeys"),
};