// services/control-plane/internal/models/scan.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Scan type constants
const (
	ScanTypeFull        = "full"
	ScanTypeIncremental = "incremental"
	ScanTypeTargeted    = "targeted"
)

// Scan status constants
const (
	ScanStatusQueued    = "queued"
	ScanStatusRunning   = "running"
	ScanStatusCompleted = "completed"
	ScanStatusFailed    = "failed"
	ScanStatusCancelled = "cancelled"
)

// Scan trigger constants
const (
	ScanTriggeredBySchedule = "schedule"
	ScanTriggeredByManual   = "manual"
	ScanTriggeredByAPI      = "api"
)

// Scan represents a single execution of the scan worker against an asset.
type Scan struct {
	bun.BaseModel `bun:"table:scans,alias:s"`

	ID              string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID        string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	AssetID         string         `bun:"asset_id,notnull,type:uuid"                 json:"asset_id"`
	ScanType        string         `bun:"scan_type,notnull"                          json:"scan_type"         validate:"required,oneof=full incremental targeted"`
	Status          string         `bun:"status,notnull,default:queued"              json:"status"`
	TriggeredBy     string         `bun:"triggered_by,notnull,default:schedule"      json:"triggered_by"      validate:"omitempty,oneof=schedule manual api"`
	CeleryTaskID    *string        `bun:"celery_task_id"                             json:"celery_task_id"`
	StartedAt       *time.Time     `bun:"started_at"                                 json:"started_at"`
	CompletedAt     *time.Time     `bun:"completed_at"                               json:"completed_at"`
	RecordsScanned  int64          `bun:"records_scanned,notnull,default:0"          json:"records_scanned"`
	PIIRecordsFound int64          `bun:"pii_records_found,notnull,default:0"        json:"pii_records_found"`
	ErrorMessage    *string        `bun:"error_message"                              json:"error_message"`
	Summary         map[string]any `bun:"summary,type:jsonb,default:{}"              json:"summary"` // {aadhaar: N, pan: N, ...}
	CreatedAt       time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`

	// Relations
	Asset    *Asset     `bun:"rel:belongs-to,join:asset_id=id"  json:"asset,omitempty"`
	Findings []*Finding `bun:"rel:has-many,join:id=scan_id"     json:"findings,omitempty"`
}

// DurationSeconds returns how long the scan ran, or nil if not yet complete.
func (s *Scan) DurationSeconds() *float64 {
	if s.StartedAt == nil || s.CompletedAt == nil {
		return nil
	}
	d := s.CompletedAt.Sub(*s.StartedAt).Seconds()
	return &d
}

// ---- DTOs -------------------------------------------------------------------

type TriggerScanInput struct {
	AssetID  string `json:"asset_id"  validate:"required,uuid"`
	ScanType string `json:"scan_type" validate:"required,oneof=full incremental targeted"`
}

type ScanListFilter struct {
	AssetID  string `query:"asset_id"`
	Status   string `query:"status"   validate:"omitempty,oneof=queued running completed failed cancelled"`
	Page     int    `query:"page"     validate:"omitempty,min=1"`
	PageSize int    `query:"page_size" validate:"omitempty,min=1,max=100"`
}
