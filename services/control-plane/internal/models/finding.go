// services/control-plane/internal/models/finding.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Finding type constants
const (
	FindingTypePIIExposure          = "pii_exposure"
	FindingTypeMisconfiguration     = "misconfiguration"
	FindingTypePolicyViolation      = "policy_violation"
	FindingTypeCrossBorderTransfer  = "cross_border_transfer"
	FindingTypeLLMLeak              = "llm_leak"
	FindingTypeRetentionViolation   = "retention_violation"
)

// Severity constants (shared across findings and alerts)
const (
	SeverityCritical = "critical"
	SeverityHigh     = "high"
	SeverityMedium   = "medium"
	SeverityLow      = "low"
	SeverityInfo     = "info"
)

// PII type constants — Indian PII taxonomy
const (
	PIITypeAadhaar    = "aadhaar"
	PIITypePAN        = "pan"
	PIITypePhone      = "phone"
	PIITypeEmail      = "email"
	PIITypeName       = "name"
	PIITypeAddress    = "address"
	PIITypeBankAccount = "bank_account"
	PIITypeUPI        = "upi"
	PIITypePassport   = "passport"
	PIITypeVoterID    = "voter_id"
	PIITypeGSTIN      = "gstin"
	PIITypeDrivingLicense = "driving_license"
)

// FindingLocation describes where the PII or violation was detected.
type FindingLocation struct {
	Table    string `json:"table,omitempty"`
	Column   string `json:"column,omitempty"`
	Bucket   string `json:"bucket,omitempty"`
	KeyPath  string `json:"key_path,omitempty"`
	Database string `json:"database,omitempty"`
	Schema   string `json:"schema,omitempty"`
}

// Finding represents a discrete PII exposure, misconfiguration, or policy violation
// discovered during a scan or gateway interception.
type Finding struct {
	bun.BaseModel `bun:"table:findings,alias:f"`

	ID             string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID       string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	ScanID         *string        `bun:"scan_id,type:uuid"                          json:"scan_id"`
	AssetID        string         `bun:"asset_id,notnull,type:uuid"                 json:"asset_id"`
	FindingType    string         `bun:"finding_type,notnull"                       json:"finding_type"     validate:"required,oneof=pii_exposure misconfiguration policy_violation cross_border_transfer llm_leak retention_violation"`
	Severity       string         `bun:"severity,notnull"                           json:"severity"         validate:"required,oneof=critical high medium low info"`
	Title          string         `bun:"title,notnull"                              json:"title"            validate:"required,min=1,max=500"`
	Description    string         `bun:"description,notnull,default:''"             json:"description"`
	PIITypes       []string       `bun:"pii_types,array,default:'{}'"               json:"pii_types"`
	Location       map[string]any `bun:"location,type:jsonb,default:{}"             json:"location"`
	SampleCount    int64          `bun:"sample_count,notnull,default:0"             json:"sample_count"`
	IsResolved     bool           `bun:"is_resolved,notnull,default:false"          json:"is_resolved"`
	ResolvedBy     *string        `bun:"resolved_by,type:uuid"                      json:"resolved_by"`
	ResolvedAt     *time.Time     `bun:"resolved_at"                                json:"resolved_at"`
	ResolutionNote *string        `bun:"resolution_note"                            json:"resolution_note"`
	Evidence       map[string]any `bun:"evidence,type:jsonb,default:{}"             json:"evidence"`
	CreatedAt      time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`

	// Relations
	Asset *Asset `bun:"rel:belongs-to,join:asset_id=id" json:"asset,omitempty"`
	Scan  *Scan  `bun:"rel:belongs-to,join:scan_id=id"  json:"scan,omitempty"`
}

// ---- DTOs -------------------------------------------------------------------

type ResolveFindingInput struct {
	ResolutionNote string `json:"resolution_note" validate:"required,min=1,max=2000"`
}

type FindingListFilter struct {
	AssetID     string `query:"asset_id"`
	ScanID      string `query:"scan_id"`
	FindingType string `query:"finding_type" validate:"omitempty,oneof=pii_exposure misconfiguration policy_violation cross_border_transfer llm_leak retention_violation"`
	Severity    string `query:"severity"     validate:"omitempty,oneof=critical high medium low info"`
	IsResolved  *bool  `query:"is_resolved"`
	Page        int    `query:"page"         validate:"omitempty,min=1"`
	PageSize    int    `query:"page_size"    validate:"omitempty,min=1,max=100"`
}

type FindingStatsResponse struct {
	Total      int64            `json:"total"`
	BySeverity map[string]int64 `json:"by_severity"`
	ByType     map[string]int64 `json:"by_type"`
	ByPIIType  map[string]int64 `json:"by_pii_type"`
	Unresolved int64            `json:"unresolved"`
}
