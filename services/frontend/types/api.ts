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
  settings: Record<string, unknown>;
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
  tags: Record<string, unknown>;
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
  rules: Record<string, unknown>;
  applies_to: Record<string, unknown>;
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
  rules: Record<string, unknown>;
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
  summary: Record<string, unknown>;
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
  location: Record<string, unknown>;
  sample_count: number;
  is_resolved: boolean;
  resolved_by?: string;
  resolved_at?: string;
  resolution_note?: string;
  evidence: Record<string, unknown>;
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
  parameters: Record<string, unknown>;
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
  response_data?: Record<string, unknown>;
  rejection_reason?: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  tenant_id: string;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string;
  user_agent: string;
  changes: string;
  timestamp: string;
}

export const API_KEY_SCOPES = ["read", "write", "gateway", "admin"] as const;

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

export interface APIKeyCreateResponse {
  id: string;
  tenant_id: string;
  user_id: string;
  name: string;
  key: string; // raw key — shown exactly once
  key_prefix: string;
  scopes: string[];
  expires_at?: string;
  created_at: string;
}

export interface DataFlow {
  id: string;
  tenant_id: string;
  source_asset_id?: string;
  destination_url: string;
  destination_type: string;
  pii_types_involved: string[];
  is_approved: boolean;
  approved_by?: string;
  first_detected_at: string;
  last_seen_at: string;
  event_count: number;
  created_at: string;
}

export interface GatewayRule {
  id: string;
  tenant_id: string;
  policy_id?: string;
  name: string;
  route_pattern: string;
  http_methods: string[];
  direction: "request" | "response" | "both";
  action: "mask" | "redact" | "block" | "tokenize" | "alert" | "allow";
  pii_types: typeof PII_TYPES[number][];
  mask_config: Record<string, unknown>;
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
  action_taken: "masked" | "blocked" | "allowed" | "redacted" | "tokenized";
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
  connection_config: Record<string, unknown>;
  credentials_ref?: string;
  tags?: Record<string, unknown>;
}

export interface UpdateAssetInput {
  name?: string;
  connection_config?: Record<string, unknown>;
  credentials_ref?: string;
  status?: typeof ASSET_STATUSES[number];
  tags?: Record<string, unknown>;
}

export interface CreatePolicyInput {
  name: string;
  description?: string;
  policy_type: typeof POLICY_TYPES[number];
  status?: typeof POLICY_STATUSES[number];
  enforcement_mode?: typeof ENFORCEMENT_MODES[number];
  priority?: number;
  rules: Record<string, unknown>;
  applies_to?: Record<string, unknown>;
}

export interface UpdatePolicyInput {
  name?: string;
  description?: string;
  status?: typeof POLICY_STATUSES[number];
  enforcement_mode?: typeof ENFORCEMENT_MODES[number];
  priority?: number;
  rules?: Record<string, unknown>;
  applies_to?: Record<string, unknown>;
  change_summary?: string;
}

export interface TriggerScanInput {
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
  response_data?: Record<string, unknown>;
  rejection_reason?: string;
}

export interface GenerateReportInput {
  report_type: typeof REPORT_TYPES[number];
  title: string;
  parameters?: Record<string, unknown>;
}

export interface CreateGatewayRuleInput {
  policy_id?: string;
  name: string;
  route_pattern: string;
  http_methods?: string[];
  direction?: "request" | "response" | "both";
  action: "mask" | "redact" | "block" | "tokenize" | "alert" | "allow";
  pii_types?: string[];
  mask_config?: Record<string, unknown>;
}

export interface UpdateGatewayRuleInput {
  name?: string;
  route_pattern?: string;
  http_methods?: string[];
  direction?: "request" | "response" | "both";
  action?: string;
  pii_types?: string[];
  mask_config?: Record<string, unknown>;
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

export interface RiskAssetRef {
  id: string;
  name: string;
  asset_type: string;
  risk_score: number;
}

export interface DashboardSummary {
  compliance_score: number;
  total_assets: number;
  pii_records_exposed: number;
  open_findings: number;
  critical_findings: number;
  unacknowledged_alerts: number;
  overdue_rights_requests: number;
  active_policies: number;
  last_scan_at?: string;
  findings_by_severity: Record<string, number>;
  top_risk_assets: RiskAssetRef[];
  recent_alerts: Alert[];
}

export interface DPDPCheck {
  requirement: string;
  status: "compliant" | "gap" | "non_compliant";
  details: string;
}

export interface DPDPStatus {
  overall_status: "compliant" | "gap" | "non_compliant";
  checks: DPDPCheck[];
  as_of: string;
}

export interface TrendPoint {
  date: string;
  critical?: number;
  high?: number;
  medium?: number;
  low?: number;
  info?: number;
  total?: number;
}

export interface FindingsSummary {
  total: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
  by_pii_type: Record<string, number>;
  unresolved: number;
}

export interface GatewayStats {
  total_events: number;
  blocked: number;
  masked: number;
  allowed: number;
  redacted: number;
  tokenized?: number;
  block_rate: number;
  avg_latency_ms: number;
  pii_detections: number;
  llm_calls?: number;
  period_hours?: number;
  by_pii_type?: Record<string, number>;
  by_action?: Record<string, number>;
  timeline?: { ts: string; count: number; blocked?: number }[];
}

// ========== Remaining Request DTOs ==========

export interface ChangePasswordInput {
  current_password: string;
  new_password: string;
}

export interface InviteUserInput {
  email: string;
  full_name: string;
  role: "admin" | "analyst" | "viewer";
}

export interface UpdateUserInput {
  full_name?: string;
  role?: typeof ROLES[number];
  is_active?: boolean;
}

export interface CreateAPIKeyInput {
  name: string;
  scopes: string[];
  expires_at?: string | null;
}

export interface UpdateAPIKeyInput {
  name?: string;
  scopes?: string[];
  expires_at?: string | null;
}

export interface ResolveFindingInput {
  resolution_note: string;
}

export interface AuditLogFilter extends PaginationParams {
  action?: string;
  resource_type?: string;
  user_id?: string;
}

// ========== Consent ==========

export const CONSENT_MECHANISMS = ["form", "api", "sdk", "import"] as const;

export interface ConsentRecord {
  id: string;
  tenant_id: string;
  data_principal_id: string;
  purpose: string;
  consent_given: boolean;
  consent_timestamp?: string;
  withdrawal_timestamp?: string;
  notice_version?: string;
  ip_address?: string;
  consent_mechanism: typeof CONSENT_MECHANISMS[number];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConsentPurposeStat {
  purpose: string;
  total: number;
  given_count: number;
  withdrawn_count: number;
}

export interface ConsentSummary {
  total_records: number;
  consent_given: number;
  consent_withdrawn: number;
  by_purpose: ConsentPurposeStat[];
}

export interface ConsentPrincipalResult {
  data_principal_id: string;
  records: ConsentRecord[];
  count: number;
}

export interface RecordConsentInput {
  data_principal_id: string;
  purpose: string;
  consent_given: boolean;
  notice_version?: string;
  consent_timestamp?: string;
  mechanism?: typeof CONSENT_MECHANISMS[number];
  metadata?: Record<string, unknown>;
}

// ========== Webhooks / Integrations ==========

export const WEBHOOK_CHANNELS = ["slack", "pagerduty", "email", "jira", "http"] as const;

export interface Webhook {
  id: string;
  tenant_id: string;
  name: string;
  channel: typeof WEBHOOK_CHANNELS[number];
  url?: string;
  email?: string;
  events: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateWebhookInput {
  name: string;
  channel: typeof WEBHOOK_CHANNELS[number];
  url?: string;
  email?: string;
  headers?: Record<string, string>;
  events: string[];
}

export interface UpdateWebhookInput {
  name?: string;
  url?: string;
  email?: string;
  headers?: Record<string, string>;
  events?: string[];
  is_active?: boolean;
}

export interface WebhookCreateResult {
  webhook: Webhook;
  signing_secret?: string;
  note?: string;
}

export interface NotificationPrefs {
  email_recipients: string[];
  slack_channel: string;
  min_severity: string;
  quiet_hours_start: string;
  quiet_hours_end: string;
  escalation_hours: number;
  escalation_emails: string[];
}

