import { apiClient } from "@/lib/api-client";
import {
  Policy,
  ListResponse,
  CreatePolicyInput,
  UpdatePolicyInput,
  PolicyListFilter,
  PolicyVersion,
} from "@/types/api";

export const policiesAPI = {
  list: (filters?: PolicyListFilter) =>
    apiClient.get<ListResponse<Policy>>("/policies", { params: filters }),

  get: (id: string) =>
    apiClient.get<Policy>(`/policies/${id}`),

  create: (data: CreatePolicyInput) =>
    apiClient.post<Policy>("/policies", data),

  update: (id: string, data: UpdatePolicyInput) =>
    apiClient.patch<Policy>(`/policies/${id}`, data),

  delete: (id: string) =>
    apiClient.delete(`/policies/${id}`),

  activate: (id: string) =>
    apiClient.post(`/policies/${id}/activate`),

  deactivate: (id: string) =>
    apiClient.post(`/policies/${id}/deactivate`),

  listVersions: (id: string) =>
    apiClient.get<ListResponse<PolicyVersion>>(`/policies/${id}/versions`),

  getByVersion: (id: string, version: number) =>
    apiClient.get<PolicyVersion>(`/policies/${id}/versions/${version}`),

  rollback: (id: string, version: number) =>
    apiClient.post(`/policies/${id}/rollback`, { version }),

  getTemplates: () =>
    apiClient.get<any>("/policies/templates"),

  applyTemplate: (templateId: string) =>
    apiClient.post(`/policies/templates/${templateId}/apply`),
};

