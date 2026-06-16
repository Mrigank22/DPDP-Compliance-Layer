import { apiClient } from "@/lib/api-client";
import {
  Policy,
  CreatePolicyInput,
  UpdatePolicyInput,
  PolicyListFilter,
  PolicyVersion,
} from "@/types/api";

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  policy_type: string;
  pack?: string;
  rules?: Record<string, unknown>;
}

export const policiesAPI = {
  list: (filters?: PolicyListFilter) =>
    apiClient.get<Policy[]>("/policies", { params: filters }),

  get: (id: string) => apiClient.get<Policy>(`/policies/${id}`),

  create: (data: CreatePolicyInput) => apiClient.post<Policy>("/policies", data),

  update: (id: string, data: UpdatePolicyInput) =>
    apiClient.patch<Policy>(`/policies/${id}`, data),

  delete: (id: string) => apiClient.delete(`/policies/${id}`),

  activate: (id: string) => apiClient.post<Policy>(`/policies/${id}/activate`),

  deactivate: (id: string) => apiClient.post<Policy>(`/policies/${id}/deactivate`),

  listVersions: (id: string) =>
    apiClient.get<PolicyVersion[]>(`/policies/${id}/versions`),

  getByVersion: (id: string, version: number) =>
    apiClient.get<PolicyVersion>(`/policies/${id}/versions/${version}`),

  rollback: (id: string, version: number) =>
    apiClient.post<Policy>(`/policies/${id}/rollback`, { version }),

  getTemplates: () =>
    apiClient.get<{ templates: PolicyTemplate[] }>("/policies/templates"),

  applyTemplate: (templateId: string) =>
    apiClient.post<Policy>(`/policies/templates/${templateId}/apply`),
};

