import { apiClient } from "@/lib/api-client";

export type AISystemStage =
  | "discovered"
  | "proposed"
  | "under_review"
  | "approved"
  | "retired";

export type AIRiskTier =
  | "unassessed"
  | "minimal"
  | "limited"
  | "high"
  | "prohibited";

export interface AIModel {
  id: string;
  tenant_id: string;
  ai_system_id?: string | null;
  provider: string;
  model: string;
  display_name: string;
  source: "observed" | "registered";
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  call_count: number;
  pii_call_count: number;
  created_at: string;
  updated_at: string;
}

export interface AISystem {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  owner: string;
  lifecycle_stage: AISystemStage;
  risk_tier: AIRiskTier;
  providers: string[];
  endpoints: string[];
  status: "active" | "archived";
  tags: Record<string, unknown>;
  approved_by?: string | null;
  approved_at?: string | null;
  last_reviewed_at?: string | null;
  review_due_at?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
  models?: AIModel[];
}

export type LifecycleAction =
  | "submit_review"
  | "approve"
  | "mark_reviewed"
  | "retire"
  | "reopen";

export interface AIAttestation {
  id: string;
  ai_system_id: string;
  action: LifecycleAction;
  from_stage: string;
  to_stage: string;
  statement: string;
  actor_id?: string | null;
  created_at: string;
  actor?: { full_name?: string; email?: string } | null;
}

export interface TransitionInput {
  action: LifecycleAction;
  statement?: string;
}

export interface AIDiscoveryRow {
  provider: string;
  model: string;
  app: string;
  destination_url: string;
  call_count: number;
  pii_call_count: number;
  pii_types: string[];
  source_count: number;
  first_seen: string;
  last_seen: string;
  registered: boolean;
  ai_system_id?: string | null;
}

export interface AIDiscoveryResponse {
  rows: AIDiscoveryRow[];
  total_models: number;
  registered_models: number;
  shadow_models: number;
  provider_count: number;
  period_hours: number;
}

export interface CreateAISystemInput {
  name: string;
  description?: string;
  owner?: string;
  lifecycle_stage?: AISystemStage;
  risk_tier?: AIRiskTier;
  providers?: string[];
  endpoints?: string[];
  tags?: Record<string, unknown>;
}

export interface UpdateAISystemInput {
  name?: string;
  description?: string;
  owner?: string;
  lifecycle_stage?: AISystemStage;
  risk_tier?: AIRiskTier;
  status?: "active" | "archived";
  providers?: string[];
  endpoints?: string[];
  tags?: Record<string, unknown>;
}

export interface PromoteAIInput {
  provider: string;
  model: string;
  name: string;
  description?: string;
  owner?: string;
  endpoint?: string;
}

export interface AIUsageModelRow {
  provider: string;
  model: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  priced: boolean;
}

export interface AIUsageAppRow {
  app: string;
  calls: number;
  total_tokens: number;
  estimated_cost_usd: number;
}

export interface AIUsageTimeBin {
  date: string;
  calls: number;
  total_tokens: number;
}

export interface AIUsageResponse {
  total_calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
  model_count: number;
  by_model: AIUsageModelRow[];
  by_app: AIUsageAppRow[];
  timeline: AIUsageTimeBin[];
  period_hours: number;
}

export type ControlStatus =
  | "met"
  | "partial"
  | "not_met"
  | "not_applicable"
  | "unanswered";

export interface FrameworkControl {
  id: string;
  ref: string;
  title: string;
  category: string;
  description: string;
}

export interface Framework {
  id: string;
  name: string;
  description: string;
  controls: FrameworkControl[];
}

export interface AssessmentControlResponse {
  control_id: string;
  status: ControlStatus;
  note: string;
}

export interface AIAssessment {
  id: string;
  tenant_id: string;
  ai_system_id: string;
  framework: string;
  status: "draft" | "in_progress" | "completed";
  responses: AssessmentControlResponse[];
  score: number;
  assessed_by?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertAssessmentInput {
  status?: "draft" | "in_progress" | "completed";
  responses: AssessmentControlResponse[];
}

export interface RiskRegisterRow {
  ai_system_id: string;
  name: string;
  owner: string;
  lifecycle_stage: AISystemStage;
  risk_tier: AIRiskTier;
  inherent_risk: number;
  readiness: number;
  residual_risk: number;
  frameworks_assessed: number;
  gaps: number;
}

export interface RiskRegisterResponse {
  rows: RiskRegisterRow[];
  total_systems: number;
  assessed_systems: number;
  high_risk: number;
  avg_residual: number;
}

export const aiGovAPI = {
  listSystems: () =>
    apiClient.get<{ systems: AISystem[]; count: number }>("/ai/systems"),
  getSystem: (id: string) => apiClient.get<AISystem>(`/ai/systems/${id}`),
  createSystem: (input: CreateAISystemInput) =>
    apiClient.post<AISystem>("/ai/systems", input),
  updateSystem: (id: string, input: UpdateAISystemInput) =>
    apiClient.patch<AISystem>(`/ai/systems/${id}`, input),
  deleteSystem: (id: string) =>
    apiClient.delete<{ message: string }>(`/ai/systems/${id}`),
  listModels: () =>
    apiClient.get<{ models: AIModel[]; count: number }>("/ai/models"),
  discover: (hours?: number) =>
    apiClient.get<AIDiscoveryResponse>(
      `/ai/discovery${hours ? `?hours=${hours}` : ""}`,
    ),
  usage: (hours?: number) =>
    apiClient.get<AIUsageResponse>(
      `/ai/usage${hours ? `?hours=${hours}` : ""}`,
    ),
  promote: (input: PromoteAIInput) =>
    apiClient.post<AISystem>("/ai/promote", input),
  frameworks: () => apiClient.get<{ frameworks: Framework[] }>("/ai/frameworks"),
  listAssessments: (systemId: string) =>
    apiClient.get<{ assessments: AIAssessment[]; count: number }>(
      `/ai/systems/${systemId}/assessments`,
    ),
  upsertAssessment: (
    systemId: string,
    framework: string,
    input: UpsertAssessmentInput,
  ) =>
    apiClient.put<AIAssessment>(
      `/ai/systems/${systemId}/assessments/${framework}`,
      input,
    ),
  riskRegister: () => apiClient.get<RiskRegisterResponse>("/ai/risk-register"),
  transition: (systemId: string, input: TransitionInput) =>
    apiClient.post<AISystem>(`/ai/systems/${systemId}/transition`, input),
  listAttestations: (systemId: string) =>
    apiClient.get<{ attestations: AIAttestation[]; count: number }>(
      `/ai/systems/${systemId}/attestations`,
    ),
};
