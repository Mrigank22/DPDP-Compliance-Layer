// services/control-plane/internal/models/report.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Report type constants
const (
	ReportTypeDPDPCompliance   = "dpdp_compliance"
	ReportTypeExecutiveSummary = "executive_summary"
	ReportTypeAssetInventory   = "asset_inventory"
	ReportTypeIncidentReport   = "incident_report"
	ReportTypeDPIA             = "dpia"
	ReportTypeAuditEvidence    = "audit_evidence"
)

// Report status constants
const (
	ReportStatusGenerating = "generating"
	ReportStatusReady      = "ready"
	ReportStatusFailed     = "failed"
)

// Report represents a generated compliance or operational document.
type Report struct {
	bun.BaseModel `bun:"table:reports,alias:r"`

	ID            string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID      string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	ReportType    string         `bun:"report_type,notnull"                        json:"report_type"   validate:"required,oneof=dpdp_compliance executive_summary asset_inventory incident_report dpia audit_evidence"`
	Title         string         `bun:"title,notnull"                              json:"title"         validate:"required,min=1,max=255"`
	Status        string         `bun:"status,notnull,default:generating"          json:"status"`
	FileURL       *string        `bun:"file_url"                                   json:"file_url"`
	FileSizeBytes *int64         `bun:"file_size_bytes"                            json:"file_size_bytes"`
	GeneratedBy   *string        `bun:"generated_by,type:uuid"                     json:"generated_by"`
	Parameters    map[string]any `bun:"parameters,type:jsonb,default:{}"           json:"parameters"`
	Content       *string        `bun:"content"                                    json:"-"`             // JSON report body; served on download, never in list/detail JSON
	ContentHTML   *string        `bun:"content_html"                               json:"-"`             // branded HTML report body; served on download
	CreatedAt     time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
}

// ---- DTOs -------------------------------------------------------------------

type GenerateReportInput struct {
	ReportType string         `json:"report_type" validate:"required,oneof=dpdp_compliance executive_summary asset_inventory incident_report dpia audit_evidence"`
	Title      string         `json:"title"       validate:"required,min=1,max=255"`
	Parameters map[string]any `json:"parameters"`
}

// ReportParameters contains the typed fields for report generation.
type ReportParameters struct {
	StartDate  *time.Time `json:"start_date"`
	EndDate    *time.Time `json:"end_date"`
	AssetIDs   []string   `json:"asset_ids"`
	FindingIDs []string   `json:"finding_ids"`
	Severities []string   `json:"severities"`
}
