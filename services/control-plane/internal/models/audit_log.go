// services/control-plane/internal/models/audit_log.go

package models

import "time"

// AuditLog represents an immutable record of a user or system action.
// These are written to ClickHouse, not PostgreSQL, so there is no bun.BaseModel.
// The struct is used for serialisation/deserialisation only.
type AuditLog struct {
	ID           string    `json:"id" ch:"id"`
	TenantID     string    `json:"tenant_id" ch:"tenant_id"`
	UserID       string    `json:"user_id" ch:"user_id"`
	Action       string    `json:"action" ch:"action"`           // e.g. user.login, policy.created
	ResourceType string    `json:"resource_type" ch:"resource_type"`
	ResourceID   string    `json:"resource_id" ch:"resource_id"`
	IPAddress    string    `json:"ip_address" ch:"ip_address"`
	UserAgent    string    `json:"user_agent" ch:"user_agent"`
	Changes      string    `json:"changes" ch:"changes"` // JSON-encoded diff
	Timestamp    time.Time `json:"timestamp" ch:"timestamp"`
}

// Common action strings — keep in sync with frontend display names.
const (
	AuditActionUserLogin          = "user.login"
	AuditActionUserLogout         = "user.logout"
	AuditActionUserCreated        = "user.created"
	AuditActionUserUpdated        = "user.updated"
	AuditActionUserDeleted        = "user.deleted"
	AuditActionPasswordReset      = "user.password_reset"
	AuditActionMFAEnabled         = "user.mfa_enabled"
	AuditActionMFADisabled        = "user.mfa_disabled"
	AuditActionAPIKeyCreated      = "api_key.created"
	AuditActionAPIKeyRevoked      = "api_key.revoked"
	AuditActionAssetCreated       = "asset.created"
	AuditActionAssetUpdated       = "asset.updated"
	AuditActionAssetDeleted       = "asset.deleted"
	AuditActionScanTriggered      = "scan.triggered"
	AuditActionScanCancelled      = "scan.cancelled"
	AuditActionPolicyCreated      = "policy.created"
	AuditActionPolicyUpdated      = "policy.updated"
	AuditActionPolicyDeleted      = "policy.deleted"
	AuditActionFindingResolved    = "finding.resolved"
	AuditActionAlertAcknowledged  = "alert.acknowledged"
	AuditActionReportGenerated    = "report.generated"
	AuditActionRightsRequestCreated = "rights_request.created"
	AuditActionRightsRequestUpdated = "rights_request.updated"
	AuditActionTenantUpdated      = "tenant.updated"
	AuditActionBreachCreated          = "breach.created"
	AuditActionBreachUpdated          = "breach.updated"
	AuditActionBreachBoardNotified    = "breach.board_notified"
	AuditActionBreachPrincipalsNotified = "breach.principals_notified"
	AuditActionBreachClosed           = "breach.closed"
	AuditActionBreachDeleted          = "breach.deleted"
)

// AuditLogFilter is the query filter for listing audit logs.
type AuditLogFilter struct {
	Action       string     `query:"action"`
	ResourceType string     `query:"resource_type"`
	ResourceID   string     `query:"resource_id"`
	UserID       string     `query:"user_id"`
	StartDate    *time.Time `query:"start_date"`
	EndDate      *time.Time `query:"end_date"`
	Page         int        `query:"page"      validate:"omitempty,min=1"`
	PageSize     int        `query:"page_size" validate:"omitempty,min=1,max=100"`
}
