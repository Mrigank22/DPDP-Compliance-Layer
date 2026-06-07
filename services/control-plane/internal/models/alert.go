// services/control-plane/internal/models/alert.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Alert type constants
const (
	AlertTypePolicyViolation      = "policy_violation"
	AlertTypeBreachDetected       = "breach_detected"
	AlertTypeScanAnomaly          = "scan_anomaly"
	AlertTypeRightsDeadline       = "rights_deadline"
	AlertTypeRetentionDue         = "retention_due"
	AlertTypeCrossBorderDetected  = "cross_border_detected"
)

// Alert represents a notification triggered by the system when a condition is met.
type Alert struct {
	bun.BaseModel `bun:"table:alerts,alias:al"`

	ID               string     `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID         string     `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	AlertType        string     `bun:"alert_type,notnull"                         json:"alert_type"        validate:"required,oneof=policy_violation breach_detected scan_anomaly rights_deadline retention_due cross_border_detected"`
	Severity         string     `bun:"severity,notnull"                           json:"severity"          validate:"required,oneof=critical high medium low info"`
	Title            string     `bun:"title,notnull"                              json:"title"             validate:"required,min=1,max=500"`
	Body             string     `bun:"body,notnull,default:''"                    json:"body"`
	RelatedFindingID *string    `bun:"related_finding_id,type:uuid"               json:"related_finding_id"`
	RelatedAssetID   *string    `bun:"related_asset_id,type:uuid"                 json:"related_asset_id"`
	IsAcknowledged   bool       `bun:"is_acknowledged,notnull,default:false"      json:"is_acknowledged"`
	AcknowledgedBy   *string    `bun:"acknowledged_by,type:uuid"                  json:"acknowledged_by"`
	AcknowledgedAt   *time.Time `bun:"acknowledged_at"                            json:"acknowledged_at"`
	NotificationSent bool       `bun:"notification_sent,notnull,default:false"    json:"notification_sent"`
	CreatedAt        time.Time  `bun:"created_at,notnull,default:now()"           json:"created_at"`

	// Relations
	RelatedFinding *Finding `bun:"rel:belongs-to,join:related_finding_id=id" json:"related_finding,omitempty"`
	RelatedAsset   *Asset   `bun:"rel:belongs-to,join:related_asset_id=id"   json:"related_asset,omitempty"`
}

// ---- DTOs -------------------------------------------------------------------

type AlertListFilter struct {
	AlertType      string `query:"alert_type"      validate:"omitempty,oneof=policy_violation breach_detected scan_anomaly rights_deadline retention_due cross_border_detected"`
	Severity       string `query:"severity"        validate:"omitempty,oneof=critical high medium low info"`
	IsAcknowledged *bool  `query:"is_acknowledged"`
	Page           int    `query:"page"            validate:"omitempty,min=1"`
	PageSize       int    `query:"page_size"       validate:"omitempty,min=1,max=100"`
}

type AcknowledgeAlertInput struct {
	AlertIDs []string `json:"alert_ids" validate:"required,min=1,dive,uuid"`
}
