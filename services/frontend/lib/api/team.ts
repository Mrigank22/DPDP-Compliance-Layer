import { apiClient } from "@/lib/api-client";
import { User, UpdateUserInput, PaginationParams } from "@/types/api";

export const teamAPI = {
  list: (filters?: PaginationParams) =>
    apiClient.get<User[]>("/team", { params: filters }),

  get: (id: string) => apiClient.get<User>(`/team/${id}`),

  update: (id: string, data: UpdateUserInput) =>
    apiClient.patch<User>(`/team/${id}`, data),

  remove: (id: string) => apiClient.delete(`/team/${id}`),
};