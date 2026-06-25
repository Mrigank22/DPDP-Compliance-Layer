import { apiClient } from "@/lib/api-client";

export type BreachStatus = "open" | "assessing" | "contained" | "notified" | "closed";
export type BreachSeverity = "low" | "medium" | "high" | "critical";
export type BreachCategory = "confidentiality" | "integrity" | "availability";

export interface BreachActor {
  id: string;
  full_name: string;
  email: string;
}

export interface BreachTimelineEntry {
  id: string;
  incident_id: string;
  entry_type: string;
  note: string;
  actor_id: string | null;
  created_at: string;
  actor?: BreachActor | null;
}

export interface BreachIncident {
  id: string;
  tenant_id: string;
  reference: string;
  title: string;
  description: string;
  status: BreachStatus;
  severity: BreachSeverity;
  categories: string[];
  affected_data_types: string[];
  affected_principals: number;
  affected_asset_ids: string[];
  discovered_at: string;
  occurred_at: string | null;
  root_cause: string;
  consequences: string;
  mitigation_measures: string;
  remedial_measures: string;
  board_notified_at: string | null;
  board_reference: string;
  principals_notified_at: string | null;
  principals_notified_count: number;
  reported_by: string | null;
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
  reporter?: BreachActor | null;
  assignee?: BreachActor | null;
  timeline?: BreachTimelineEntry[];
  // Computed server-side:
  board_deadline: string;
  board_overdue: boolean;
  principals_pending: boolean;
}

export interface BreachStats {
  total: number;
  open: number;
  critical_open: number;
  board_overdue: number;
  awaiting_principals: number;
  closed: number;
}

export interface BreachListFilter {
  status?: string;
  severity?: string;
  overdue?: string;
  page?: number;
  page_size?: number;
}

export interface CreateBreachInput {
  title: string;
  description?: string;
  severity?: BreachSeverity;
  categories?: BreachCategory[];
  affected_data_types?: string[];
  affected_principals?: number;
  affected_asset_ids?: string[];
  discovered_at?: string;
  occurred_at?: string;
}

export interface UpdateBreachInput {
  title?: string;
  description?: string;
  status?: BreachStatus;
  severity?: BreachSeverity;
  categories?: BreachCategory[];
  affected_data_types?: string[];
  affected_principals?: number;
  occurred_at?: string;
  root_cause?: string;
  consequences?: string;
  mitigation_measures?: string;
  remedial_measures?: string;
  assigned_to?: string;
}

export const breachesAPI = {
  list: (params?: BreachListFilter) =>
    apiClient.get<BreachIncident[]>("/breaches", { params }),

  stats: () => apiClient.get<BreachStats>("/breaches/stats"),

  get: (id: string) => apiClient.get<BreachIncident>(`/breaches/${id}`),

  create: (data: CreateBreachInput) =>
    apiClient.post<BreachIncident>("/breaches", data),

  update: (id: string, data: UpdateBreachInput) =>
    apiClient.patch<BreachIncident>(`/breaches/${id}`, data),

  addNote: (id: string, note: string) =>
    apiClient.post<BreachTimelineEntry>(`/breaches/${id}/timeline`, { note }),

  notifyBoard: (id: string, data: { reference?: string; note?: string }) =>
    apiClient.post<BreachIncident>(`/breaches/${id}/notify-board`, data),

  notifyPrincipals: (id: string, data: { count?: number; note?: string }) =>
    apiClient.post<BreachIncident>(`/breaches/${id}/notify-principals`, data),

  close: (id: string, note?: string) =>
    apiClient.post<BreachIncident>(`/breaches/${id}/close`, { note }),

  evidence: (id: string) =>
    apiClient.get<{ generated_at: string; incident: BreachIncident }>(`/breaches/${id}/evidence`),

  remove: (id: string) =>
    apiClient.delete<{ message: string }>(`/breaches/${id}`),
};
