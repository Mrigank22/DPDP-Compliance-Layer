// services/control-plane/internal/models/policy.go

package models

import (
	"time"

	"github.com/uptrace/bun"
)

// Policy type constants
const (
	PolicyTypeDataMasking      = "data_masking"
	PolicyTypeTransferControl  = "transfer_control"
	PolicyTypeRetention        = "retention"
	PolicyTypeConsent          = "consent"
	PolicyTypeAccessControl    = "access_control"
	PolicyTypeLLMGuard         = "llm_guard"
	PolicyTypeBreachResponse   = "breach_response"
)

// Policy status constants
const (
	PolicyStatusActive   = "active"
	PolicyStatusInactive = "inactive"
	PolicyStatusDraft    = "draft"
)

// Enforcement mode constants
const (
	EnforcementAlert    = "alert"
	EnforcementEnforce  = "enforce"
	EnforcementAuditOnly = "audit_only"
)

// PolicyRule is a typed representation of a rule within the DSL stored in rules JSONB.
// Each rule has a condition tree and a list of actions to take when the condition matches.
type PolicyRule struct {
	ID          string         `json:"id"`
	Name        string         `json:"name"`
	Conditions  []RuleCondition `json:"conditions"`
	LogicOp     string         `json:"logic_op"` // AND | OR
	Actions     []RuleAction   `json:"actions"`
}

type RuleCondition struct {
	Field    string `json:"field"`    // pii_type | asset_type | destination | data_volume
	Operator string `json:"operator"` // contains | equals | greater_than | in | not_in
	Value    any    `json:"value"`
}

type RuleAction struct {
	Type   string         `json:"type"`   // mask | redact | block | alert | tokenize | encrypt
	Config map[string]any `json:"config"` // action-specific config (masking chars, token map, etc.)
}

// PolicyAppliesTo defines which assets a policy targets.
type PolicyAppliesTo struct {
	AssetIDs   []string       `json:"asset_ids"`
	AssetTypes []string       `json:"asset_types"`
	Tags       map[string]any `json:"tags"`
}

// Policy is a governance rule that can be enforced by the gateway or evaluated during scans.
type Policy struct {
	bun.BaseModel `bun:"table:policies,alias:p"`

	ID              string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	TenantID        string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	Name            string         `bun:"name,notnull"                               json:"name"              validate:"required,min=1,max=255"`
	Description     string         `bun:"description,notnull,default:''"             json:"description"`
	PolicyType      string         `bun:"policy_type,notnull"                        json:"policy_type"       validate:"required,oneof=data_masking transfer_control retention consent access_control llm_guard breach_response"`
	Status          string         `bun:"status,notnull,default:active"              json:"status"            validate:"omitempty,oneof=active inactive draft"`
	EnforcementMode string         `bun:"enforcement_mode,notnull,default:alert"     json:"enforcement_mode"  validate:"omitempty,oneof=alert enforce audit_only"`
	Priority        int            `bun:"priority,notnull,default:100"               json:"priority"          validate:"omitempty,min=1"`
	Rules           map[string]any `bun:"rules,type:jsonb,default:{}"                json:"rules"`
	AppliesTo       map[string]any `bun:"applies_to,type:jsonb,default:{}"           json:"applies_to"`
	CreatedBy       *string        `bun:"created_by,type:uuid"                       json:"created_by"`
	Version         int            `bun:"version,notnull,default:1"                  json:"version"`
	CreatedAt       time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
	UpdatedAt       time.Time      `bun:"updated_at,notnull,default:now()"           json:"updated_at"`

	// Relations
	Tenant   *Tenant          `bun:"rel:belongs-to,join:tenant_id=id" json:"tenant,omitempty"`
	Versions []*PolicyVersion `bun:"rel:has-many,join:id=policy_id"   json:"versions,omitempty"`
}

// PolicyVersion is an immutable snapshot of policy rules at a given version.
type PolicyVersion struct {
	bun.BaseModel `bun:"table:policy_versions,alias:pv"`

	ID            string         `bun:"id,pk,type:uuid,default:uuid_generate_v4()" json:"id"`
	PolicyID      string         `bun:"policy_id,notnull,type:uuid"                json:"policy_id"`
	TenantID      string         `bun:"tenant_id,notnull,type:uuid"                json:"tenant_id"`
	Version       int            `bun:"version,notnull"                            json:"version"`
	Rules         map[string]any `bun:"rules,type:jsonb,notnull"                   json:"rules"`
	ChangedBy     *string        `bun:"changed_by,type:uuid"                       json:"changed_by"`
	ChangeSummary string         `bun:"change_summary,notnull,default:''"          json:"change_summary"`
	CreatedAt     time.Time      `bun:"created_at,notnull,default:now()"           json:"created_at"`
}

// ---- DTOs -------------------------------------------------------------------

type CreatePolicyInput struct {
	Name            string         `json:"name"             validate:"required,min=1,max=255"`
	Description     string         `json:"description"`
	PolicyType      string         `json:"policy_type"      validate:"required,oneof=data_masking transfer_control retention consent access_control llm_guard breach_response"`
	Status          string         `json:"status"           validate:"omitempty,oneof=active inactive draft"`
	EnforcementMode string         `json:"enforcement_mode" validate:"omitempty,oneof=alert enforce audit_only"`
	Priority        int            `json:"priority"         validate:"omitempty,min=1"`
	Rules           map[string]any `json:"rules"            validate:"required"`
	AppliesTo       map[string]any `json:"applies_to"`
}

type UpdatePolicyInput struct {
	Name            *string        `json:"name"             validate:"omitempty,min=1,max=255"`
	Description     *string        `json:"description"`
	Status          *string        `json:"status"           validate:"omitempty,oneof=active inactive draft"`
	EnforcementMode *string        `json:"enforcement_mode" validate:"omitempty,oneof=alert enforce audit_only"`
	Priority        *int           `json:"priority"         validate:"omitempty,min=1"`
	Rules           map[string]any `json:"rules"`
	AppliesTo       map[string]any `json:"applies_to"`
	ChangeSummary   string         `json:"change_summary"`
}
