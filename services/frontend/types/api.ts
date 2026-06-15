/**
 * DataSentinel API Type Definitions
 * Matching backend Go models
 */

// ========== Enums & Constants ==========

export const ASSET_TYPES = [
  "s3_bucket",
  "rds_instance",
  "gcs_bucket",
  "azure_blob",
  "postgresql",
  "api_endpoint",
  "llm_endpoint",
] as const;

export const PROVIDERS = ["aws", "gcp", "azure", "onprem"] as const;

export const ASSET_STATUSES = ["connected", "disconnected", "scanning", "error"] as const;

export const SEVERITY_LEVELS = ["critical", "high", "medium", "low", "info"] as const;

export const ROLES = ["owner", "admin", "analyst", "viewer"] as const;

export const FINDING_TYPES = [
  "pii_exposure",
  "misconfiguration",
  "policy_violation",
  "cross_border_transfer",
  "llm_leak",
  "retention_violation",
] as const;

export const PII_TYPES = [
  "aadhaar",
  "pan",
  "phone",
  "email",
  "name",
  "address",
  "bank_account",
  "upi",
  "passport",
  "voter_id",
  "gstin",
  "driving_license",
] as const;

export const POLICY_TYPES = [
  "data_masking",
  "transfer_control",
  "retention",
  "consent",
  "access_control",
  "llm_guard",
  "breach_response",
] as const;

export const POLICY_STATUSES = ["active", "inactive", "draft"] as const;

export const ENFORCEMENT_MODES = ["alert", "enforce", "audit_only"] as const;

export const SCAN_TYPES = ["full", "incremental", "targeted"] as const;

export const SCAN_STATUSES = ["queued", "running", "completed", "failed", "cancelled"] as const;

export const ALERT_TYPES = [
  "policy_violation",
  "breach_detected",
  "scan_anomaly",
  "rights_deadline",
  "retention_due",
  "cross_border_detected",
] as const;

export const RIGHTS_TYPES = ["access", "correction", "erasure", "portability", "nomination"] as const;

export const RIGHTS_STATUSES = ["received", "in_progress", "completed", "rejected"] as const;

export const REPORT_TYPES = [
  "dpdp_compliance",
  "executive_summary",
  "asset_inventory",
  "incident_report",
  "dpia",
  "audit_evidence",
] as const;

export const REPORT_STATUSES = ["generating", "ready", "failed"] as const;

export const PLAN_TYPES = ["starter", "growth", "enterprise"] as const;

// ========== Models ==========

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: typeof PLAN_TYPES[number];
  is_active: boolean;
  settings: Record<string, any>;
  data_region: string;
  private_deploy: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  full_name: string;
  role: typeof ROLES[number];
  is_active: boolean;
  last_login_at?: string;
  mfa_enabled: boolean;
  invited_by?: string;
  created_at: string;
  updated_at: string;
}

export interface Asset {
  id: string;
  tenant_id: string;
  name: string;
  asset_type: typeof ASSET_TYPES[number];
  provider: typeof PROVIDERS[number];
  region?: string;
  credentials_ref?: string;
  status: typeof ASSET_STATUSES[number];
  last_scanned_at?: string;
  pii_record_count: number;
  risk_score: number;
  tags: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface Policy {
  id: string;
  tenant_id: string;
  name: string;
  description: string;
  policy_type: typeof POLICY_TYPES[number];
  status: typeof POLICY_STATUSES[number];
  enforcement_mode: typeof ENFORCEMENT_MODES[number];
  priority: number;
  rules: Record<string, any>;
  applies_to: Record<string, any>;
  created_by?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface PolicyVersion {
  id: string;
  policy_id: string;
  tenant_id: string;
  version: number;
  rules: Record<string, any>;
  changed_by?: string;
  change_summary: string;
  created_at: string;
}

export interface Scan {
  id: string;
  tenant_id: string;
  asset_id: string;
  scan_type: typeof SCAN_TYPES[number];
  status: typeof SCAN_STATUSES[number];
  triggered_by: "schedule" | "manual" | "api";
  celery_task_id?: string;
  started_at?: string;
  completed_at?: string;
  records_scanned: number;
  pii_records_found: number;
  error_message?: string;
  summary: Record<string, any>;
  created_at: string;
}

export interface Finding {
  id: string;
  tenant_id: string;
  scan_id?: string;
  asset_id: string;
  finding_type: typeof FINDING_TYPES[number];
  severity: typeof SEVERITY_LEVELS[number];
  title: string;
  description: string;
  pii_types: typeof PII_TYPES[number][];
  location: Record<string, any>;
  sample_count: number;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  resolution_note?: string;
  evidence: Record<string, any>;
  created_at: string;
}

export interface Alert {
  id: string;
  tenant_id: string;
  alert_type: typeof ALERT_TYPES[number];
  severity: typeof SEVERITY_LEVELS[number];
  title: string;
  body: string;
  related_finding_id?: string;
  related_asset_id?: string;
  is_acknowledged: boolean;
  acknowledged_by?: string;
  acknowledged_at?: string;
  notification_sent: boolean;
  created_at: string;
}

export interface Report {
  id: string;
  tenant_id: string;
  report_type: typeof REPORT_TYPES[number];
  title: string;
  status: typeof REPORT_STATUSES[number];
  file_url?: string;
  file_size_bytes?: number;
  generated_by?: string;
  parameters: Record<string, any>;
  created_at: string;
}

export interface RightsRequest {
  id: string;
  tenant_id: string;
  request_type: typeof RIGHTS_TYPES[number];
  data_principal_email: string;
  data_principal_name?: string;
  status: typeof RIGHTS_STATUSES[number];
  due_date: string;
  assigned_to?: string;
  notes?: string;
  response_data?: Record<string, any>;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id?: string;
  action: string;
  resource: string;
  resource_id?: string;
  details: Record<string, any>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export interface GatewayRule {
  id: string;
  tenant_id: string;
  policy_id: string;
  name: string;
  route_pattern: string;
  http_methods: string[];
  direction: "request" | "response" | "both";
  action: "mask" | "redact" | "block" | "tokenize" | "alert" | "allow";
  pii_types: typeof PII_TYPES[number][];
  mask_config: Record<string, any>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface GatewayEvent {
  id: string;
  tenant_id: string;
  gateway_rule_id: string;
  timestamp: string;
  request_id: string;
  source_ip: string;
  destination_url: string;
  http_method: string;
  action_taken: "masked" | "blocked" | "allowed" | "redacted";
  pii_types_detected: string[];
  field_names: string[];
  payload_size_bytes: number;
  processing_latency_ms: number;
  was_llm_call: boolean;
  llm_provider: string;
  policy_id?: string;
}

// ========== API Request/Response Types ==========

export interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: User;
}

export interface ListResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    page_size: number;
    has_more: boolean;
  };
}

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

// ========== Request DTOs ==========

export interface RegisterInput {
  email: string;
  password: string;
  full_name: string;
  tenant_name: string;
  tenant_slug: string;
}

export interface LoginInput {
  email: string;
  password: string;
  totp_code?: string;
}

export interface CreateAssetInput {
  name: string;
  asset_type: typeof ASSET_TYPES[number];
  provider: typeof PROVIDERS[number];
  region?: string;
  connection_config: Record<string, any>;
  credentials_ref?: string;
  tags?: Record<string, any>;
}

export interface UpdateAssetInput {
  name?: string;
  connection_config?: Record<string, any>;
  credentials_ref?: string;
  status?: typeof ASSET_STATUSES[number];
  tags?: Record<string, any>;
}

export interface CreatePolicyInput {
  name: string;
  description?: string;
  policy_type: typeof POLICY_TYPES[number];
  status?: typeof POLICY_STATUSES[number];
  enforcement_mode?: typeof ENFORCEMENT_MODES[number];
  priority?: number;
  rules: Record<string, any>;
  applies_to?: Record<string, any>;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  status?: typeof POLICY_STATUSES[number];
  enforcement_mode?: typeof ENFORCEMENT_MODES[number];
  priority?: number;
  rules?: Record<string, any>;
  applies_to?: Record<string, any>;
  change_summary?: string;
}

export interface TriggerScanInput {
  asset_id: string;
  scan_type: typeof SCAN_TYPES[number];
}

export interface CreateRightsRequestInput {
  request_type: typeof RIGHTS_TYPES[number];
  data_principal_email: string;
  data_principal_name?: string;
  notes?: string;
}

export interface UpdateRightsRequestInput {
  status?: typeof RIGHTS_STATUSES[number];
  assigned_to?: string;
  notes?: string;
  response_data?: Record<string, any>;
  rejection_reason?: string;
}

export interface GenerateReportInput {
  report_type: typeof REPORT_TYPES[number];
  title: string;
  parameters?: Record<string, any>;
}

export interface CreateGatewayRuleInput {
  policy_id: string;
  name: string;
  route_pattern: string;
  http_methods?: string[];
  direction?: "request" | "response" | "both";
  action: "mask" | "redact" | "block" | "tokenize" | "alert" | "allow";
  pii_types?: string[];
  mask_config?: Record<string, any>;
}

export interface UpdateGatewayRuleInput {
  name?: string;
  route_pattern?: string;
  http_methods?: string[];
  direction?: "request" | "response" | "both";
  action?: string;
  pii_types?: string[];
  mask_config?: Record<string, any>;
  is_active?: boolean;
}

// ========== Filter Types ==========

export interface AssetListFilter extends PaginationParams {
  asset_type?: string;
  provider?: string;
  status?: string;
  search?: string;
}

export interface FindingListFilter extends PaginationParams {
  asset_id?: string;
  scan_id?: string;
  finding_type?: string;
  severity?: string;
  is_resolved?: boolean;
}

export interface ScanListFilter extends PaginationParams {
  asset_id?: string;
  status?: string;
}

export interface AlertListFilter extends PaginationParams {
  alert_type?: string;
  severity?: string;
  is_acknowledged?: boolean;
}

export interface RightsRequestListFilter extends PaginationParams {
  request_type?: string;
  status?: string;
  overdue?: boolean;
}

export interface PolicyListFilter extends PaginationParams {
  policy_type?: string;
  status?: string;
  search?: string;
}

// ========== Dashboard Types ==========

export interface DashboardStats {
  total_assets: number;
  total_findings: number;
  critical_findings: number;
  unresolved_violations: number;
  risk_score: number;
  active_policies: number;
}

export interface RiskScoreTrend {
  date: string;
  score: number;
}

export interface FindingsSummary {
  total: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
  by_pii_type: Record<string, number>;
  unresolved: number;
}

export interface GatewayStats {
  requests_per_second: number;
  block_rate: number;
  average_latency_ms: number;
  top_pii_type: string;
  total_events: number;
}

export interface DPDPStatus {
  compliance_percentage: number;
  critical_issues: number;
  deadlines_approaching: number;
  policies_active: number;
}

