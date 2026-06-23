// services/control-plane/internal/models/detection_setting.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Detection tuning limits (defensive caps; also enforced in the worker).
const (
	DefaultConfidenceThreshold = 0.7
	MaxCustomPIITypes          = 100
	MaxIgnorePatterns          = 200
	MaxDetectionRegexLength    = 500
)

// CustomPIIType is a tenant-defined detector: a labelled regular expression the
// scanner treats as an additional PII category. Patterns are validated as RE2
// (linear-time, ReDoS-safe) before being stored.
type CustomPIIType struct {
	Key     string  `json:"key"`     // stable uppercase identifier, e.g. EMPLOYEE_ID
	Label   string  `json:"label"`   // human-readable label
	Regex   string  `json:"regex"`   // RE2 pattern
	Score   float64 `json:"score"`   // confidence assigned to a match (0..1)
	Enabled bool    `json:"enabled"`
}

// IgnorePattern suppresses known false positives whose matched text matches the
// given regular expression (an allow-list of values to never flag).
type IgnorePattern struct {
	Pattern string `json:"pattern"` // RE2 pattern
	Note    string `json:"note"`
}

// DetectionSetting holds a tenant's PII-detection tuning.
type DetectionSetting struct {
	bun.BaseModel `bun:"table:detection_settings,alias:ds"`

	ID                  string          `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID            string          `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	ConfidenceThreshold float64         `bun:"confidence_threshold,notnull,default:0.7"   json:"confidence_threshold"`
	CustomPIITypes      []CustomPIIType `bun:"custom_pii_types,type:jsonb,default:'[]'"   json:"custom_pii_types"`
	IgnorePatterns      []IgnorePattern `bun:"ignore_patterns,type:jsonb,default:'[]'"    json:"ignore_patterns"`
	UpdatedBy           *string         `bun:"updated_by,type:uuid"                       json:"updated_by"`
	CreatedAt           time.Time       `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt           time.Time       `bun:"updated_at,notnull,default:now()"           json:"updated_at"`
}

// UpsertDetectionSettingsInput is the request body for updating detection tuning.
type UpsertDetectionSettingsInput struct {
	ConfidenceThreshold float64         `json:"confidence_threshold" validate:"gte=0,lte=1"`
	CustomPIITypes      []CustomPIIType `json:"custom_pii_types"`
	IgnorePatterns      []IgnorePattern `json:"ignore_patterns"`
}
