/** Human-readable labels for backend enum values. */

export function humanize(value?: string | null): string {
  if (!value) return "—";
  return value
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export const ASSET_TYPE_LABELS: Record<string, string> = {
  s3_bucket: "S3 Bucket",
  rds_instance: "RDS Instance",
  gcs_bucket: "GCS Bucket",
  azure_blob: "Azure Blob",
  postgresql: "PostgreSQL",
  api_endpoint: "API Endpoint",
  llm_endpoint: "LLM Endpoint",
};

export const PROVIDER_LABELS: Record<string, string> = {
  aws: "AWS",
  gcp: "Google Cloud",
  azure: "Azure",
  onprem: "On-Prem",
};

export const PII_LABELS: Record<string, string> = {
  aadhaar: "Aadhaar",
  pan: "PAN",
  phone: "Phone",
  email: "Email",
  name: "Name",
  address: "Address",
  bank_account: "Bank A/C",
  upi: "UPI",
  passport: "Passport",
  voter_id: "Voter ID",
  gstin: "GSTIN",
  driving_license: "Driving License",
};

export const POLICY_TYPE_LABELS: Record<string, string> = {
  data_masking: "Data Masking",
  transfer_control: "Transfer Control",
  retention: "Retention",
  consent: "Consent",
  access_control: "Access Control",
  llm_guard: "LLM Guard",
  breach_response: "Breach Response",
};

export const FINDING_TYPE_LABELS: Record<string, string> = {
  pii_exposure: "PII Exposure",
  misconfiguration: "Misconfiguration",
  policy_violation: "Policy Violation",
  cross_border_transfer: "Cross-Border Transfer",
  llm_leak: "LLM Leak",
  retention_violation: "Retention Violation",
};

export const RIGHTS_TYPE_LABELS: Record<string, string> = {
  access: "Access",
  correction: "Correction",
  erasure: "Erasure",
  portability: "Portability",
  nomination: "Nomination",
};

export const REPORT_TYPE_LABELS: Record<string, string> = {
  dpdp_compliance: "DPDP Compliance",
  executive_summary: "Executive Summary",
  asset_inventory: "Asset Inventory",
  incident_report: "Incident Report",
  dpia: "DPIA",
  audit_evidence: "Audit Evidence",
};

export const ALERT_TYPE_LABELS: Record<string, string> = {
  policy_violation: "Policy Violation",
  breach_detected: "Breach Detected",
  scan_anomaly: "Scan Anomaly",
  rights_deadline: "Rights Deadline",
  retention_due: "Retention Due",
  cross_border_detected: "Cross-Border Detected",
};

export const GATEWAY_ACTION_LABELS: Record<string, string> = {
  mask: "Mask",
  redact: "Redact",
  block: "Block",
  tokenize: "Tokenize",
  alert: "Alert",
  allow: "Allow",
};

export function label(map: Record<string, string>, key?: string | null): string {
  if (!key) return "—";
  return map[key] ?? humanize(key);
}
