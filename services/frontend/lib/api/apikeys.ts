import { apiClient } from "@/lib/api-client";
import { ListResponse, PaginationParams } from "@/types/api";

export interface APIKey {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at?: string;
  expires_at?: string;
  is_active: boolean;
  created_at: string;
}

export interface APIKeyCreateResponse extends APIKey {
  key: string;
}

export interface CreateAPIKeyInput {
  name: string;
  scopes: string[];
  expires_at?: string;
}

export interface UpdateAPIKeyInput {
  name?: string;
  scopes?: string[];
  expires_at?: string;
}

export const apiKeysAPI = {
  list: (filters?: PaginationParams) =>
    apiClient.get<ListResponse<APIKey>>("/apikeys", { params: filters }),

  get: (id: string) =>
    apiClient.get<APIKey>(`/apikeys/${id}`),

  create: (data: CreateAPIKeyInput) =>
    apiClient.post<APIKeyCreateResponse>("/apikeys", data),

  update: (id: string, data: UpdateAPIKeyInput) =>
    apiClient.patch<APIKey>(`/apikeys/${id}`, data),

  revoke: (id: string) =>
    apiClient.delete(`/apikeys/${id}`),

  revokeAll: () =>
    apiClient.delete("/apikeys"),
};