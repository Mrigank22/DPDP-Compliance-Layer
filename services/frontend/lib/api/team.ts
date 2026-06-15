import { apiClient } from "@/lib/api-client";
import { User, ListResponse, PaginationParams } from "@/types/api";

export const teamAPI = {
  list: (filters?: PaginationParams) =>
    apiClient.get<ListResponse<User>>("/team", { params: filters }),

  get: (id: string) =>
    apiClient.get<User>(`/team/${id}`),

  update: (id: string, data: { role?: string; is_active?: boolean }) =>
    apiClient.patch<User>(`/team/${id}`, data),

  remove: (id: string) =>
    apiClient.delete(`/team/${id}`),
};